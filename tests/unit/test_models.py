import pytest
from pydantic import ValidationError

from qa_agent.models import TestCase as CaseModel


def test_case_rejects_non_sequential_steps() -> None:
    with pytest.raises(ValidationError, match="sequentially"):
        CaseModel.model_validate(
            {
                "id": "TC-001",
                "scenario_id": "SCN-001",
                "title": "Example",
                "preconditions": [],
                "steps": [{"number": 2, "action": "Act", "expected": "Observed"}],
                "expected_result": "Observed",
                "priority": "high",
                "test_type": "e2e",
                "tags": ["@smoke"],
                "requirement_ids": ["REQ-X-001"],
            }
        )
