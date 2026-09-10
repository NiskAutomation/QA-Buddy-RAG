from __future__ import annotations

import base64
import json
import mimetypes
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from .models import (
    AutomationArtifact,
    CasesArtifact,
    PlanArtifact,
    RequirementsArtifact,
    ScenariosArtifact,
    StrategyArtifact,
)
from .validation import validate_artifact


ArtifactT = TypeVar("ArtifactT", bound=BaseModel)


class GenerationProvider(ABC):
    @abstractmethod
    def generate(
        self,
        stage: str,
        model: type[ArtifactT],
        instructions: str,
        context: dict[str, Any],
    ) -> ArtifactT:
        raise NotImplementedError

    @abstractmethod
    def describe_image(self, path: Path) -> str:
        raise NotImplementedError


class ClaudeProvider(GenerationProvider):
    """Claude tool-use adapter with JSON Schema validation at the boundary."""

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when provider=claude")
        from anthropic import Anthropic

        self.client = Anthropic(api_key=api_key)
        self.model = model

    def generate(
        self,
        stage: str,
        model: type[ArtifactT],
        instructions: str,
        context: dict[str, Any],
    ) -> ArtifactT:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=8_192,
            system=(
                "You are a senior QA architect. Use only supplied evidence. "
                "Never invent requirements or source references. Return the result "
                "only through the emit_artifact tool."
            ),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Stage: {stage}\n\n{instructions}\n\nEvidence:\n"
                                f"{json.dumps(context, ensure_ascii=False, indent=2)}"
                            ),
                        }
                    ],
                }
            ],
            tools=[
                {
                    "name": "emit_artifact",
                    "description": "Emit the complete, schema-conformant stage artifact.",
                    "input_schema": model.model_json_schema(),
                }
            ],
            tool_choice={"type": "tool", "name": "emit_artifact"},
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "emit_artifact":
                return validate_artifact(model, block.input)
        raise RuntimeError(f"Claude did not emit a structured artifact for stage {stage}")

    def describe_image(self, path: Path) -> str:
        media_type = mimetypes.guess_type(path.name)[0] or "image/png"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2_048,
            system="Extract testable UI facts. Do not infer hidden behavior.",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe visible screens, controls, labels, states, validation, "
                                "navigation cues, and plausible user flows. Mark uncertainty explicitly."
                            ),
                        },
                    ],
                }
            ],
        )
        return "\n".join(block.text for block in response.content if getattr(block, "type", None) == "text")


class MockProvider(GenerationProvider):
    """Deterministic provider for CI and zero-key local demonstrations."""

    def generate(
        self,
        stage: str,
        model: type[ArtifactT],
        instructions: str,
        context: dict[str, Any],
    ) -> ArtifactT:
        del instructions
        builders = {
            "requirements": self._requirements,
            "test_plan": self._test_plan,
            "test_strategy": self._test_strategy,
            "scenarios": self._scenarios,
            "test_cases": self._test_cases,
            "automation": self._automation,
        }
        if stage not in builders:
            raise ValueError(f"Unsupported mock generation stage: {stage}")
        payload = builders[stage](context)
        return validate_artifact(model, payload)

    def describe_image(self, path: Path) -> str:
        return (
            f"Image artifact `{path.name}` was supplied. Required testable UI facts are "
            "unavailable because the offline mock provider cannot perform vision extraction; "
            "use --provider claude for UI details."
        )

    @staticmethod
    def _requirements(context: dict[str, Any]) -> dict[str, Any]:
        requirements: list[dict[str, Any]] = []
        acceptance_criteria = [
            line.lstrip("-* ").strip()
            for chunk in context["chunks"]
            if "acceptance criteria" in chunk["section"].lower()
            for line in chunk["text"].splitlines()
            if line.lstrip().startswith(("-", "*"))
        ]
        fallback_number = 1
        seen: set[str] = set()
        for chunk in context["chunks"]:
            if "acceptance criteria" in chunk["section"].lower():
                continue
            match = re.search(r"\bREQ-[A-Z0-9][A-Z0-9-]*\b", f"{chunk['section']} {chunk['text']}")
            if not match and not re.search(r"\b(shall|must|required|mandatory)\b", chunk["text"], re.I):
                continue
            requirement_id = match.group(0) if match else f"REQ-GEN-{fallback_number:03d}"
            fallback_number += int(match is None)
            if requirement_id in seen:
                continue
            seen.add(requirement_id)
            title = re.sub(
                r"^.*?REQ-[A-Z0-9][A-Z0-9-]*\s*[—–:-]?\s*",
                "",
                chunk["section"],
            ).strip() or requirement_id
            lower = f"{title} {chunk['text']}".lower()
            kind = "non_functional" if any(word in lower for word in ("browser", "performance", "evidence", "security")) else "functional"
            ambiguities = []
            if "offline mock provider cannot perform vision extraction" in lower:
                ambiguities.append(
                    f"What testable controls, labels, states, and flows are visible in {chunk['document']}?"
                )
            requirements.append(
                {
                    "id": requirement_id,
                    "title": title,
                    "statement": chunk["text"],
                    "kind": kind,
                    "acceptance_criteria": [],
                    "ambiguities": ambiguities,
                    "sources": [
                        {
                            "document": chunk["document"],
                            "section": chunk["section"],
                            "chunk_id": chunk["id"],
                        }
                    ],
                }
            )
        stopwords = {"the", "a", "an", "is", "are", "be", "can", "with", "and", "or", "to"}
        for criterion in acceptance_criteria:
            words = set(re.findall(r"[a-z0-9]+", criterion.lower())) - stopwords
            if not requirements or not words:
                continue
            best = max(
                requirements,
                key=lambda item: len(
                    words
                    & (
                        set(re.findall(r"[a-z0-9]+", item["title"].lower()))
                        | set(re.findall(r"[a-z0-9]+", item["statement"].lower()))
                    )
                ),
            )
            best["acceptance_criteria"].append(criterion)
        return {"requirements": requirements}

    @staticmethod
    def _test_plan(context: dict[str, Any]) -> dict[str, Any]:
        ids = [item["id"] for item in context["requirements"]]
        return {
            "test_plan": {
                "title": "Requirements-driven QA test plan",
                "scope_in": ["Functional acceptance criteria", "Critical browser journeys", "Failure evidence"],
                "scope_out": ["Production load testing", "Third-party service certification"],
                "objectives": ["Verify each retrieved requirement", "Preserve requirement-to-script traceability"],
                "entry_criteria": ["Requirements are parseable", "Test environment is reachable", "Test data is available"],
                "exit_criteria": ["All critical cases pass", "No requirement is missing a test case", "Report is published"],
                "risks": ["Ambiguous UI selectors", "Environment or test-data drift", "Generated code requires target-specific review"],
                "environments": ["local", "staging", "production smoke (read-only)"],
                "requirement_ids": ids,
            }
        }

    @staticmethod
    def _test_strategy(context: dict[str, Any]) -> dict[str, Any]:
        ids = [item["id"] for item in context["requirements"]]
        return {
            "test_strategy": {
                "approach": "Risk-based pyramid with API setup and focused browser assertions.",
                "levels": [
                    {"level": "unit", "approach": "Validate pure rules and schema boundaries.", "tools": ["pytest", "Vitest"], "coverage_target": "All critical rules"},
                    {"level": "api", "approach": "Seed and clean test state through APIs.", "tools": ["Playwright request"], "coverage_target": "All setup and teardown paths"},
                    {"level": "ui", "approach": "Exercise visible behavior through accessible selectors.", "tools": ["Playwright"], "coverage_target": "Critical UI states"},
                    {"level": "e2e", "approach": "Run customer journeys across configured browsers.", "tools": ["Playwright", "Cucumber"], "coverage_target": "100% critical journeys"},
                ],
                "test_data": "External JSON data, isolated per test; secrets supplied through environment variables.",
                "environments": ["dev", "staging", "prod"],
                "quality_gates": ["Schema validation succeeds", "Critical tests pass", "Every requirement is traceable"],
                "tags": ["@smoke", "@regression", "@api"],
                "requirement_ids": ids,
            }
        }

    @staticmethod
    def _scenarios(context: dict[str, Any]) -> dict[str, Any]:
        scenarios = []
        for number, requirement in enumerate(context["requirements"], start=1):
            priority = "critical" if "AUTH" in requirement["id"] else "high"
            scenarios.append(
                {
                    "id": f"SCN-{number:03d}",
                    "title": f"Verify {requirement['title']}",
                    "objective": requirement["statement"],
                    "priority": priority,
                    "requirement_ids": [requirement["id"]],
                    "tags": ["@smoke" if priority == "critical" else "@regression"],
                }
            )
        return {"scenarios": scenarios}

    @staticmethod
    def _test_cases(context: dict[str, Any]) -> dict[str, Any]:
        cases: list[dict[str, Any]] = []
        for number, scenario in enumerate(context["scenarios"], start=1):
            objective = scenario["objective"].lower()
            data: dict[str, str] = {}
            if "invalid" in objective or "incorrect" in objective:
                steps = [
                    {"number": 1, "action": "Open the login page", "expected": "Login form is visible"},
                    {"number": 2, "action": "Submit unknown@example.com and Wrong123!", "expected": "Submission is rejected"},
                    {"number": 3, "action": "Observe the error", "expected": "Invalid email or password is displayed"},
                ]
                data = {"email": "unknown@example.com", "password": "Wrong123!"}
            elif "mandatory" in objective or "empty" in objective or "required field" in objective:
                steps = [
                    {"number": 1, "action": "Open the login page", "expected": "Login form is visible"},
                    {"number": 2, "action": "Submit with email and password empty", "expected": "Browser validation blocks submission"},
                ]
            elif "sign in" in objective or "successful login" in scenario["title"].lower():
                steps = [
                    {"number": 1, "action": "Open the login page", "expected": "Login form is visible"},
                    {"number": 2, "action": "Submit qa@example.com and Correct123!", "expected": "Credentials are accepted"},
                    {"number": 3, "action": "Observe the welcome area", "expected": "Welcome, QA Customer is displayed"},
                ]
                data = {"email": "qa@example.com", "password": "Correct123!"}
            else:
                steps = [
                    {"number": 1, "action": "Prepare the documented test environment", "expected": "Environment is ready"},
                    {"number": 2, "action": f"Exercise: {scenario['objective']}", "expected": "The documented requirement is satisfied"},
                ]
            cases.append(
                {
                    "id": f"TC-{number:03d}",
                    "scenario_id": scenario["id"],
                    "title": scenario["title"],
                    "preconditions": ["Configured test environment is reachable", "Test data is isolated"],
                    "steps": steps,
                    "expected_result": "All step-level expectations are met.",
                    "priority": scenario["priority"],
                    "test_type": "e2e",
                    "tags": scenario["tags"],
                    "requirement_ids": scenario["requirement_ids"],
                    "data": data,
                }
            )
        return {"test_cases": cases}

    @staticmethod
    def _automation(context: dict[str, Any]) -> dict[str, Any]:
        case = context["test_case"]
        case_id = case["id"]
        title = case["title"].replace("'", "\\'")
        objective = " ".join(step["action"] for step in case["steps"]).lower()
        tags = " ".join(case["tags"])
        feature = (
            f"@generated {tags}\nFeature: {case['title']}\n"
            f"  Scenario: {case_id} {case['title']}\n"
            f"    Given the configured application is available\n"
            f"    When the automated flow for {case_id} is executed\n"
            f"    Then the documented expectations are satisfied\n"
        )
        if "unknown@example.com" in objective:
            body = """  await page.goto('/');
  await page.getByLabel('Email').fill('unknown@example.com');
  await page.getByLabel('Password').fill('Wrong123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');"""
        elif "email and password empty" in objective:
            body = """  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Email')).toHaveJSProperty('validity.valid', false);"""
        elif "qa@example.com" in objective:
            body = """  await page.goto('/');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Correct123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toHaveText('Welcome, QA Customer');"""
        else:
            target_note = re.sub(r"\s+", " ", case["steps"][-1]["action"]).strip()
            body = f"""  await page.goto('/');
  // Target-specific implementation required: {target_note}
  await expect(page).toHaveURL(/.*/);"""
        script = (
            "import { test, expect } from '@playwright/test';\n\n"
            f"test('{case_id}: {title}', async ({{ page }}) => {{\n{body}\n}});\n"
        )
        return {
            "bundles": [
                {
                    "case_id": case_id,
                    "files": [
                        {"path": f"features/{case_id}.feature", "content": feature},
                        {"path": f"tests/{case_id}.spec.ts", "content": script},
                    ],
                    "assumptions": ["Accessible labels match the requirement language", "The configured base URL serves the target application"],
                }
            ]
        }


def make_provider(name: str, anthropic_api_key: str | None, anthropic_model: str) -> GenerationProvider:
    if name == "claude":
        return ClaudeProvider(anthropic_api_key or "", anthropic_model)
    if name == "mock":
        return MockProvider()
    raise ValueError(f"Unknown provider: {name}")
