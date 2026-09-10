from qa_agent.models import RequirementsArtifact
from qa_agent.providers import MockProvider


def test_mock_provider_extracts_requirement_and_source() -> None:
    artifact = MockProvider().generate(
        "requirements",
        RequirementsArtifact,
        "ignored",
        {
            "chunks": [
                {
                    "id": "CHK-001",
                    "document": "crs.md",
                    "section": "REQ-AUTH-001 — Login",
                    "ordinal": 0,
                    "text": "The system shall allow an active customer to sign in.",
                }
            ]
        },
    )

    assert artifact.requirements[0].id == "REQ-AUTH-001"
    assert artifact.requirements[0].sources[0].chunk_id == "CHK-001"
