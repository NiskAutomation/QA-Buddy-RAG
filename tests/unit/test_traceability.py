from qa_agent.models import (
    AutomationBundle,
    GeneratedFile,
    Requirement,
    SourceRef,
    TestCase as CaseModel,
    TestScenario as ScenarioModel,
    TestStep as StepModel,
)
from qa_agent.traceability import build_traceability


def requirement() -> Requirement:
    return Requirement(
        id="REQ-X-001",
        title="Example",
        statement="The system shall work.",
        kind="functional",
        sources=[SourceRef(document="x.md", section="Example", chunk_id="CHK-1")],
    )


def scenario() -> ScenarioModel:
    return ScenarioModel(
        id="SCN-001",
        title="Example",
        objective="Verify it works",
        priority="high",
        requirement_ids=["REQ-X-001"],
        tags=["@smoke"],
    )


def test_traceability_reports_covered_script() -> None:
    case = CaseModel(
        id="TC-001",
        scenario_id="SCN-001",
        title="Example",
        preconditions=[],
        steps=[StepModel(number=1, action="Act", expected="Works")],
        expected_result="Works",
        priority="high",
        test_type="e2e",
        tags=["@smoke"],
        requirement_ids=["REQ-X-001"],
    )
    bundle = AutomationBundle(
        case_id="TC-001",
        files=[GeneratedFile(path="tests/TC-001.spec.ts", content="// test")],
        assumptions=[],
    )

    row = build_traceability([requirement()], [scenario()], [case], [bundle])[0]

    assert row.coverage_status == "covered"
    assert row.script_files == ["tests/TC-001.spec.ts"]


def test_traceability_exposes_human_gate_as_missing_script() -> None:
    case = CaseModel(
        id="TC-001",
        scenario_id="SCN-001",
        title="Example",
        preconditions=[],
        steps=[StepModel(number=1, action="Act", expected="Works")],
        expected_result="Works",
        priority="high",
        test_type="e2e",
        tags=["@smoke"],
        requirement_ids=["REQ-X-001"],
    )

    row = build_traceability([requirement()], [scenario()], [case], [])[0]

    assert row.coverage_status == "missing_script"
