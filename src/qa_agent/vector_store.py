from __future__ import annotations

import hashlib
import math
import re
from pathlib import Path

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from .models import SourceChunk


class LocalHashEmbedding(EmbeddingFunction[Documents]):
    """Zero-download local embeddings for deterministic/offline operation.

    Token and bigram features are projected into a fixed vector. Production users
    can replace this with Chroma's sentence-transformer embedding function without
    changing the store contract.
    """

    def __init__(self, dimensions: int = 384) -> None:
        self.dimensions = dimensions

    def __call__(self, input: Documents) -> Embeddings:
        return [self._embed(document) for document in input]

    @staticmethod
    def name() -> str:
        return "qa-local-hash-v1"

    def get_config(self) -> dict[str, int]:
        return {"dimensions": self.dimensions}

    @staticmethod
    def build_from_config(config: dict[str, int]) -> "LocalHashEmbedding":
        return LocalHashEmbedding(dimensions=config.get("dimensions", 384))

    def _embed(self, text: str) -> list[float]:
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        features = tokens + [f"{left}_{right}" for left, right in zip(tokens, tokens[1:])]
        vector = [0.0] * self.dimensions
        for feature in features:
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            value = int.from_bytes(digest, "big")
            index = value % self.dimensions
            sign = -1.0 if value & 1 else 1.0
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


def make_embedding(backend: str, model_name: str) -> EmbeddingFunction[Documents]:
    if backend == "hash":
        return LocalHashEmbedding()
    if backend == "sentence_transformer":
        try:
            from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        except (ImportError, ModuleNotFoundError) as error:
            raise RuntimeError(
                "Sentence-transformer retrieval requires: pip install -e '.[semantic]'"
            ) from error
        return SentenceTransformerEmbeddingFunction(model_name=model_name)
    raise ValueError(f"Unsupported embedding backend: {backend}")


class RequirementStore:
    def __init__(
        self,
        persist_path: Path,
        collection_name: str,
        embedding_function: EmbeddingFunction[Documents] | None = None,
    ) -> None:
        self.client = chromadb.PersistentClient(path=str(persist_path))
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_function or LocalHashEmbedding(),
            metadata={"hnsw:space": "cosine"},
        )

    def replace(self, chunks: list[SourceChunk]) -> None:
        existing = self.collection.get(include=[])
        if existing["ids"]:
            self.collection.delete(ids=existing["ids"])
        self.collection.add(
            ids=[chunk.id for chunk in chunks],
            documents=[chunk.text for chunk in chunks],
            metadatas=[
                {
                    "document": chunk.document,
                    "section": chunk.section,
                    "ordinal": chunk.ordinal,
                }
                for chunk in chunks
            ],
        )

    def query(self, query: str, limit: int = 6) -> list[SourceChunk]:
        count = self.collection.count()
        if not count:
            return []
        result = self.collection.query(
            query_texts=[query],
            n_results=min(limit, count),
            include=["documents", "metadatas"],
        )
        ids = result["ids"][0]
        documents = result["documents"][0] if result["documents"] else []
        metadatas = result["metadatas"][0] if result["metadatas"] else []
        return [
            SourceChunk(
                id=chunk_id,
                document=str(metadata["document"]),
                section=str(metadata["section"]),
                ordinal=int(metadata["ordinal"]),
                text=document,
            )
            for chunk_id, document, metadata in zip(ids, documents, metadatas)
        ]
