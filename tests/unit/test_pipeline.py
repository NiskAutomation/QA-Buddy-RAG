from pathlib import Path

from qa_agent.config import Settings
from qa_agent.pipeline import QAPipeline
from qa_agent.providers import MockProvider


ROOT = Path(__file__).resolve().parents[2]


def pipeline(tmp_path: Path) -> QAPipeline:
    return QAPipeline(
        Settings(chroma_path=tmp_path / "chroma", provider="mock"),
        MockProvider(),
    )


def test_pipeline_stops_at_test_case_approval_gate(tmp_path: Path) -> None:
    state = pipeline(tmp_path).run(
        input_path=ROOT / "sample" / "requirements" / "sample-crs.md",
        output_dir=tmp_path / "artifacts",
        approve_test_cases=False,
        publish_dir=tmp_path / "public",
        generated_root=tmp_path / "automation" / "generated",
    )

    assert state["status"] == "approval_required"
    assert (tmp_path / "artifacts" / "06-test-cases.json").exists()
    assert not (tmp_path / "artifacts" / "07-automation-manifest.json").exists()
    assert {row["coverage_status"] for row in state["traceability"]} == {"missing_script"}


def test_pipeline_stops_for_unresolved_image_requirements(tmp_path: Path) -> None:
    image = tmp_path / "wireframe.png"
    image.write_bytes(b"mock provider does not inspect image bytes")

    state = pipeline(tmp_path).run(
        input_path=image,
        output_dir=tmp_path / "artifacts",
        approve_test_cases=True,
        publish_dir=tmp_path / "public",
        generated_root=tmp_path / "automation" / "generated",
    )

    assert state["status"] == "clarification_required"
    assert state["clarification_questions"]
    assert not (tmp_path / "artifacts" / "03-test-plan.json").exists()
