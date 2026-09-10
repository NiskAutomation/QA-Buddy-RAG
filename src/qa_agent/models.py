from __future__ import annotations

from pathlib import PurePosixPath
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Priority = Literal["critical", "high", "medium", "low"]


class SourceRef(BaseModel):
    document: str
    section: str
    chunk_id: str


class SourceChunk(BaseModel):
    id: str
    document: str
    section: str
    ordinal: int
    text: str


class Requirement(BaseModel):
    id: str = Field(pattern=r"^REQ-[A-Z0-9][A-Z0-9-]*$")
    title: str
    statement: str
    kind: Literal["functional", "non_functional", "business_rule", "unknown"]
    acceptance_criteria: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    sources: list[SourceRef] = Field(min_length=1)


class TestPlan(BaseModel):
    title: str
    scope_in: list[str]
    scope_out: list[str]
    objectives: list[str]
    entry_criteria: list[str]
    exit_criteria: list[str]
    risks: list[str]
    environments: list[str]
    requirement_ids: list[str]


class TestLevel(BaseModel):
    level: Literal["unit", "api", "ui", "e2e"]
    approach: str
    tools: list[str]
    coverage_target: str


class TestStrategy(BaseModel):
    approach: str
    levels: list[TestLevel]
    test_data: str
    environments: list[str]
    quality_gates: list[str]
    tags: list[str]
    requirement_ids: list[str]


class TestScenario(BaseModel):
    id: str = Field(pattern=r"^SCN-[0-9]{3,}$")
    title: str
    objective: str
    priority: Priority
    requirement_ids: list[str] = Field(min_length=1)
    tags: list[str]


class TestStep(BaseModel):
    number: int = Field(ge=1)
    action: str
    expected: str


class TestCase(BaseModel):
    id: str = Field(pattern=r"^TC-[0-9]{3,}$")
    scenario_id: str = Field(pattern=r"^SCN-[0-9]{3,}$")
    title: str
    preconditions: list[str]
    steps: list[TestStep] = Field(min_length=1)
    expected_result: str
    priority: Priority
    test_type: Literal["unit", "api", "ui", "e2e"]
    tags: list[str]
    requirement_ids: list[str] = Field(min_length=1)
    data: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def sequential_steps(self) -> "TestCase":
        numbers = [step.number for step in self.steps]
        if numbers != list(range(1, len(numbers) + 1)):
            raise ValueError("test steps must be numbered sequentially from 1")
        return self


class GeneratedFile(BaseModel):
    path: str
    content: str

    @field_validator("path")
    @classmethod
    def safe_relative_path(cls, value: str) -> str:
        path = PurePosixPath(value.replace("\\", "/"))
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("generated file path must stay inside automation/generated")
        if not path.parts:
            raise ValueError("generated file path is empty")
        return path.as_posix()


class AutomationBundle(BaseModel):
    case_id: str = Field(pattern=r"^TC-[0-9]{3,}$")
    files: list[GeneratedFile] = Field(min_length=1)
    assumptions: list[str]


class TraceRow(BaseModel):
    requirement_id: str
    scenario_ids: list[str]
    test_case_ids: list[str]
    script_files: list[str]
    coverage_status: Literal["covered", "missing_scenario", "missing_case", "missing_script"]


class RequirementsArtifact(BaseModel):
    requirements: list[Requirement]


class PlanArtifact(BaseModel):
    test_plan: TestPlan


class StrategyArtifact(BaseModel):
    test_strategy: TestStrategy


class ScenariosArtifact(BaseModel):
    scenarios: list[TestScenario]


class CasesArtifact(BaseModel):
    test_cases: list[TestCase]


class AutomationArtifact(BaseModel):
    bundles: list[AutomationBundle]


class TraceabilityArtifact(BaseModel):
    rows: list[TraceRow]
