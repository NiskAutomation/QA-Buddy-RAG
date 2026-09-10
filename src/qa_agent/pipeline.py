from __future__ import annotations

import hashlib
import shutil
from pathlib import Path, PurePosixPath
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .config import Settings
from .dashboard import render_dashboard
from .ingestion import DocumentIngestor
from .models import (
    AutomationArtifact,
    AutomationBundle,
    CasesArtifact,
    PlanArtifact,
    Requirement,
    RequirementsArtifact,
    ScenariosArtifact,
    SourceChunk,
    StrategyArtifact,
    TestCase,
    TestScenario,
    TraceRow,
    TraceabilityArtifact,
)
from .prompts import (
    AUTOMATION_PROMPT,
    REQUIREMENTS_PROMPT,
    SCENARIOS_PROMPT,
    TEST_CASES_PROMPT,
    TEST_PLAN_PROMPT,
    TEST_STRATEGY_PROMPT,
)
from .providers import GenerationProvider
from .traceability import build_traceability, validate_links
from .validation import write_artifact
from .vector_store import RequirementStore, make_embedding


class PipelineState(TypedDict, total=False):
    input_path: str
    output_dir: str
    publish_dir: str
    generated_root: str
    collection_name: str
    approve_test_cases: bool
    status: str
    clarification_questions: list[str]
    chunks: list[dict[str, Any]]
    requirements: list[dict[str, Any]]
    test_plan: dict[str, Any]
    test_strategy: dict[str, Any]
    scenarios: list[dict[str, Any]]
    test_cases: list[dict[str, Any]]
    automation_bundles: list[dict[str, Any]]
    traceability: list[dict[str, Any]]
    artifact_paths: list[str]


def _collection_name(input_path: Path, output_dir: Path, embedding_signature: str) -> str:
    digest = hashlib.sha1(
        f"{input_path.resolve()}|{output_dir.resolve()}|{embedding_signature}".encode()
    ).hexdigest()[:16]
    return f"qa-{digest}"


class QAPipeline:
    def __init__(self, settings: Settings, provider: GenerationProvider) -> None:
        self.settings = settings
        self.provider = provider
        self.graph = self._build_graph()

    def run(
        self,
        input_path: Path,
        output_dir: Path,
        approve_test_cases: bool,
        publish_dir: Path,
        generated_root: Path,
    ) -> PipelineState:
        output_dir.mkdir(parents=True, exist_ok=True)
        initial: PipelineState = {
            "input_path": str(input_path.resolve()),
            "output_dir": str(output_dir.resolve()),
            "publish_dir": str(publish_dir.resolve()),
            "generated_root": str(generated_root.resolve()),
            "collection_name": _collection_name(
                input_path,
                output_dir,
                f"{self.settings.embedding_backend}:{self.settings.embedding_model}",
            ),
            "approve_test_cases": approve_test_cases,
            "status": "started",
            "artifact_paths": [],
        }
        return self.graph.invoke(initial)

    def _store(self, state: PipelineState) -> RequirementStore:
        return RequirementStore(
            self.settings.chroma_path,
            state["collection_name"],
            make_embedding(self.settings.embedding_backend, self.settings.embedding_model),
        )

    def _retrieved(self, state: PipelineState, query: str) -> list[dict[str, Any]]:
        return [
            chunk.model_dump(mode="json")
            for chunk in self._store(state).query(query, self.settings.retrieval_k)
        ]

    def _build_graph(self):
        workflow = StateGraph(PipelineState)
        workflow.add_node("ingest", self._ingest)
        workflow.add_node("requirements", self._requirements)
        workflow.add_node("clarification_pending", self._clarification_pending)
        workflow.add_node("test_plan", self._test_plan)
        workflow.add_node("test_strategy", self._test_strategy)
        workflow.add_node("scenarios", self._scenarios)
        workflow.add_node("test_cases", self._test_cases)
        workflow.add_node("approval_pending", self._approval_pending)
        workflow.add_node("automation", self._automation)
        workflow.add_node("traceability", self._traceability)
        workflow.add_node("dashboard", self._dashboard)

        workflow.add_edge(START, "ingest")
        workflow.add_edge("ingest", "requirements")
        workflow.add_conditional_edges(
            "requirements",
            lambda state: "clarify"
            if any(item.get("ambiguities") for item in state["requirements"])
            else "continue",
            {"clarify": "clarification_pending", "continue": "test_plan"},
        )
        workflow.add_edge("clarification_pending", END)
        workflow.add_edge("test_plan", "test_strategy")
        workflow.add_edge("test_strategy", "scenarios")
        workflow.add_edge("scenarios", "test_cases")
        workflow.add_conditional_edges(
            "test_cases",
            lambda state: "approved" if state["approve_test_cases"] else "pending",
            {"approved": "automation", "pending": "approval_pending"},
        )
        workflow.add_edge("approval_pending", "traceability")
        workflow.add_edge("automation", "traceability")
        workflow.add_edge("traceability", "dashboard")
        workflow.add_edge("dashboard", END)
        return workflow.compile()

    def _ingest(self, state: PipelineState) -> PipelineState:
        ingestor = DocumentIngestor(
            vision_describer=self.provider.describe_image,
            max_chunk_chars=self.settings.max_chunk_chars,
            overlap_paragraphs=self.settings.chunk_overlap_paragraphs,
        )
        chunks = ingestor.ingest(Path(state["input_path"]))
        self._store(state).replace(chunks)
        path = write_artifact(
            Path(state["output_dir"]) / "01-source-chunks.json",
            {"chunks": [chunk.model_dump(mode="json") for chunk in chunks]},
        )
        return {
            "chunks": [chunk.model_dump(mode="json") for chunk in chunks],
            "status": "ingested",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _requirements(self, state: PipelineState) -> PipelineState:
        artifact = self.provider.generate(
            "requirements",
            RequirementsArtifact,
            REQUIREMENTS_PROMPT,
            {"chunks": state["chunks"]},
        )
        if not artifact.requirements:
            raise ValueError("No testable requirements were extracted")
        path = write_artifact(Path(state["output_dir"]) / "02-requirements.json", artifact)
        return {
            "requirements": [item.model_dump(mode="json") for item in artifact.requirements],
            "status": "requirements_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _clarification_pending(self, state: PipelineState) -> PipelineState:
        questions = [
            f"{requirement['id']}: {question}"
            for requirement in state["requirements"]
            for question in requirement.get("ambiguities", [])
        ]
        path = write_artifact(
            Path(state["output_dir"]) / "02a-clarification-questions.json",
            {
                "questions": questions,
                "next_step": "Update or supplement the source requirements, then rerun.",
            },
        )
        return {
            "clarification_questions": questions,
            "status": "clarification_required",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _test_plan(self, state: PipelineState) -> PipelineState:
        chunks = self._retrieved(state, "scope objectives entry exit criteria risks environments")
        artifact = self.provider.generate(
            "test_plan",
            PlanArtifact,
            TEST_PLAN_PROMPT,
            {"requirements": state["requirements"], "retrieved_chunks": chunks},
        )
        self._assert_known_requirement_ids(artifact.test_plan.requirement_ids, state)
        path = write_artifact(Path(state["output_dir"]) / "03-test-plan.json", artifact)
        return {
            "test_plan": artifact.test_plan.model_dump(mode="json"),
            "status": "test_plan_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _test_strategy(self, state: PipelineState) -> PipelineState:
        chunks = self._retrieved(state, "quality risks browsers API UI performance security test environment")
        artifact = self.provider.generate(
            "test_strategy",
            StrategyArtifact,
            TEST_STRATEGY_PROMPT,
            {
                "requirements": state["requirements"],
                "test_plan": state["test_plan"],
                "retrieved_chunks": chunks,
            },
        )
        self._assert_known_requirement_ids(artifact.test_strategy.requirement_ids, state)
        path = write_artifact(Path(state["output_dir"]) / "04-test-strategy.json", artifact)
        return {
            "test_strategy": artifact.test_strategy.model_dump(mode="json"),
            "status": "test_strategy_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _scenarios(self, state: PipelineState) -> PipelineState:
        evidence = self._evidence_for_requirements(state)
        artifact = self.provider.generate(
            "scenarios",
            ScenariosArtifact,
            SCENARIOS_PROMPT,
            {
                "requirements": state["requirements"],
                "test_strategy": state["test_strategy"],
                "retrieved_chunks": evidence,
            },
        )
        requirements = [Requirement.model_validate(item) for item in state["requirements"]]
        validate_links(requirements, artifact.scenarios, [])
        path = write_artifact(Path(state["output_dir"]) / "05-test-scenarios.json", artifact)
        return {
            "scenarios": [item.model_dump(mode="json") for item in artifact.scenarios],
            "status": "scenarios_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _test_cases(self, state: PipelineState) -> PipelineState:
        evidence = self._evidence_for_requirements(state)
        artifact = self.provider.generate(
            "test_cases",
            CasesArtifact,
            TEST_CASES_PROMPT,
            {
                "requirements": state["requirements"],
                "scenarios": state["scenarios"],
                "retrieved_chunks": evidence,
            },
        )
        validate_links(
            [Requirement.model_validate(item) for item in state["requirements"]],
            [TestScenario.model_validate(item) for item in state["scenarios"]],
            artifact.test_cases,
        )
        path = write_artifact(Path(state["output_dir"]) / "06-test-cases.json", artifact)
        return {
            "test_cases": [item.model_dump(mode="json") for item in artifact.test_cases],
            "status": "test_cases_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    @staticmethod
    def _approval_pending(state: PipelineState) -> PipelineState:
        return {"status": "approval_required", "automation_bundles": []}

    def _automation(self, state: PipelineState) -> PipelineState:
        bundles: list[AutomationBundle] = []
        generated_root = Path(state["generated_root"])
        previous_manifest = Path(state["output_dir"]) / "07-automation-manifest.json"
        if previous_manifest.exists():
            previous = AutomationArtifact.model_validate_json(previous_manifest.read_text(encoding="utf-8"))
            root = generated_root.resolve()
            for bundle in previous.bundles:
                for generated_file in bundle.files:
                    relative = PurePosixPath(generated_file.path)
                    target = generated_root.joinpath(*relative.parts)
                    if target.exists():
                        resolved = target.resolve()
                        if not resolved.is_relative_to(root):
                            raise ValueError(f"Refusing to remove generated file outside {root}: {resolved}")
                        target.unlink()
        for raw_case in state["test_cases"]:
            case = TestCase.model_validate(raw_case)
            query = f"{case.title} {' '.join(case.requirement_ids)} {' '.join(step.action for step in case.steps)}"
            evidence = self._retrieved(state, query)
            artifact = self.provider.generate(
                "automation",
                AutomationArtifact,
                AUTOMATION_PROMPT,
                {
                    "test_case": case.model_dump(mode="json"),
                    "retrieved_chunks": evidence,
                    "base_url": self.settings.base_url,
                },
            )
            if len(artifact.bundles) != 1 or artifact.bundles[0].case_id != case.id:
                raise ValueError(f"Automation output must contain exactly one bundle for {case.id}")
            bundle = artifact.bundles[0]
            bundles.append(bundle)
            for generated_file in bundle.files:
                relative = PurePosixPath(generated_file.path)
                target = generated_root.joinpath(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(generated_file.content, encoding="utf-8")

        artifact = AutomationArtifact(bundles=bundles)
        path = write_artifact(Path(state["output_dir"]) / "07-automation-manifest.json", artifact)
        return {
            "automation_bundles": [item.model_dump(mode="json") for item in bundles],
            "status": "automation_generated",
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _traceability(self, state: PipelineState) -> PipelineState:
        rows = build_traceability(
            [Requirement.model_validate(item) for item in state["requirements"]],
            [TestScenario.model_validate(item) for item in state["scenarios"]],
            [TestCase.model_validate(item) for item in state["test_cases"]],
            [AutomationBundle.model_validate(item) for item in state.get("automation_bundles", [])],
        )
        artifact = TraceabilityArtifact(rows=rows)
        path = write_artifact(Path(state["output_dir"]) / "08-traceability-matrix.json", artifact)
        return {
            "traceability": [item.model_dump(mode="json") for item in rows],
            "artifact_paths": [*state.get("artifact_paths", []), str(path)],
        }

    def _dashboard(self, state: PipelineState) -> PipelineState:
        final_status = "complete" if state["approve_test_cases"] else "approval_required"
        output_path = render_dashboard(
            [TraceRow.model_validate(item) for item in state["traceability"]],
            final_status,
            Path(state["output_dir"]) / "report" / "index.html",
        )
        publish_path = Path(state["publish_dir"]) / "index.html"
        publish_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output_path, publish_path)
        return {
            "status": final_status,
            "artifact_paths": [*state.get("artifact_paths", []), str(output_path), str(publish_path)],
        }

    def _evidence_for_requirements(self, state: PipelineState) -> list[dict[str, Any]]:
        unique: dict[str, dict[str, Any]] = {}
        for requirement in state["requirements"]:
            query = f"{requirement['id']} {requirement['title']} {requirement['statement']}"
            for chunk in self._retrieved(state, query):
                unique[chunk["id"]] = chunk
        return list(unique.values())

    @staticmethod
    def _assert_known_requirement_ids(ids: list[str], state: PipelineState) -> None:
        known = {item["id"] for item in state["requirements"]}
        unknown = sorted(set(ids) - known)
        if unknown:
            raise ValueError(f"Artifact references unknown requirements: {unknown}")
