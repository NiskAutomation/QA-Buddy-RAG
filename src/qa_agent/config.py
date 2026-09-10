from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables or ``.env``."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    provider: Literal["mock", "claude"] = Field("mock", alias="QA_AGENT_PROVIDER")
    anthropic_api_key: str | None = Field(None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field("claude-sonnet-4-5", alias="ANTHROPIC_MODEL")
    chroma_path: Path = Field(Path(".chroma"), alias="CHROMA_PATH")
    collection: str = Field("qa-requirements", alias="QA_AGENT_COLLECTION")
    embedding_backend: Literal["hash", "sentence_transformer"] = Field(
        "hash", alias="QA_AGENT_EMBEDDING"
    )
    embedding_model: str = Field("all-MiniLM-L6-v2", alias="QA_AGENT_EMBEDDING_MODEL")
    base_url: str = Field("http://127.0.0.1:4173", alias="QA_AGENT_BASE_URL")
    retrieval_k: int = 6
    max_chunk_chars: int = 1_600
    chunk_overlap_paragraphs: int = 1
