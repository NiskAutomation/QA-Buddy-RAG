from __future__ import annotations

from .models import AutomationBundle, Requirement, TestCase, TestScenario, TraceRow


def validate_links(
    requirements: list[Requirement],
    scenarios: list[TestScenario],
    test_cases: list[TestCase],
) -> None:
    requirement_ids = {item.id for item in requirements}
    scenario_ids = {item.id for item in scenarios}

    unknown_scenario_requirements = {
        requirement_id
        for scenario in scenarios
        for requirement_id in scenario.requirement_ids
        if requirement_id not in requirement_ids
    }
    unknown_case_requirements = {
        requirement_id
        for case in test_cases
        for requirement_id in case.requirement_ids
        if requirement_id not in requirement_ids
    }
    unknown_case_scenarios = {case.scenario_id for case in test_cases if case.scenario_id not in scenario_ids}

    errors: list[str] = []
    if unknown_scenario_requirements:
        errors.append(f"scenarios reference unknown requirements: {sorted(unknown_scenario_requirements)}")
    if unknown_case_requirements:
        errors.append(f"test cases reference unknown requirements: {sorted(unknown_case_requirements)}")
    if unknown_case_scenarios:
        errors.append(f"test cases reference unknown scenarios: {sorted(unknown_case_scenarios)}")
    if errors:
        raise ValueError("; ".join(errors))


def build_traceability(
    requirements: list[Requirement],
    scenarios: list[TestScenario],
    test_cases: list[TestCase],
    bundles: list[AutomationBundle],
) -> list[TraceRow]:
    validate_links(requirements, scenarios, test_cases)
    script_by_case = {
        bundle.case_id: [file.path for file in bundle.files if file.path.endswith((".ts", ".js"))]
        for bundle in bundles
    }
    rows: list[TraceRow] = []
    for requirement in requirements:
        linked_scenarios = [item.id for item in scenarios if requirement.id in item.requirement_ids]
        linked_cases = [
            item.id
            for item in test_cases
            if requirement.id in item.requirement_ids and item.scenario_id in linked_scenarios
        ]
        scripts = sorted({script for case_id in linked_cases for script in script_by_case.get(case_id, [])})
        if not linked_scenarios:
            status = "missing_scenario"
        elif not linked_cases:
            status = "missing_test_case"
        elif not scripts:
            status = "missing_script"
        else:
            status = "covered"
        # Pydantic's enum intentionally uses missing_case; normalize the descriptive branch.
        normalized_status = "missing_case" if status == "missing_test_case" else status
        rows.append(
            TraceRow(
                requirement_id=requirement.id,
                scenario_ids=linked_scenarios,
                test_case_ids=linked_cases,
                script_files=scripts,
                coverage_status=normalized_status,
            )
        )
    return rows
