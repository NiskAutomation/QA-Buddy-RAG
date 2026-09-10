from __future__ import annotations

import json
from pathlib import Path
from typing import TypeVar

from jsonschema import Draft202012Validator
from pydantic import BaseModel


ArtifactT = TypeVar("ArtifactT", bound=BaseModel)


def validate_artifact(model: type[ArtifactT], payload: object) -> ArtifactT:
    """Validate twice: portable JSON Schema first, then Pydantic invariants."""

    schema = model.model_json_schema()
    Draft202012Validator(schema).validate(payload)
    return model.model_validate(payload)


def write_artifact(path: Path, artifact: BaseModel | dict[str, object]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(artifact, BaseModel):
        payload = artifact.model_dump(mode="json")
    else:
        payload = artifact
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
