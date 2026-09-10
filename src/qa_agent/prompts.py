REQUIREMENTS_PROMPT = """
Extract atomic, testable requirements from the supplied source chunks.
- Preserve an explicit source requirement ID when present.
- Otherwise assign REQ-GEN-NNN in stable source order.
- Keep source chunk IDs exact; do not cite chunks that are not supplied.
- Split compound statements only when each part can be verified independently.
- Put every blocking ambiguity or missing test datum in `ambiguities` as a direct
  clarification question. Never silently resolve it. Use an empty list when clear.
""".strip()

TEST_PLAN_PROMPT = """
Create a concise IEEE-style test plan grounded only in the retrieved evidence and
the normalized requirement catalog. Include scope, objectives, entry/exit criteria,
risks, environments, and all relevant requirement IDs. Do not introduce product
features absent from the evidence.
""".strip()

TEST_STRATEGY_PROMPT = """
Define a risk-based test strategy across unit, API, UI, and E2E levels. Prefer API
setup/teardown and reserve browser actions for the behavior under test. State tools,
coverage targets, data isolation, environment handling, tags, and quality gates.
Every referenced requirement ID must exist in the supplied catalog.
""".strip()

SCENARIOS_PROMPT = """
Produce high-level, independently testable scenarios. Use IDs SCN-NNN. Cover positive,
negative, boundary, authorization, and relevant non-functional behavior supported by
the evidence. Map every scenario to at least one real requirement ID and ensure every
requirement has scenario coverage.
""".strip()

TEST_CASES_PROMPT = """
Turn the supplied scenarios into executable test cases using IDs TC-NNN. Each case
must contain explicit preconditions, ordered steps with step-level expectations, a
priority, test level, tags, externalizable data, and valid scenario/requirement links.
Do not invent credentials, URLs, selectors, or expected messages that are absent from
the retrieved evidence; mark unresolved target details in the case text.
""".strip()

AUTOMATION_PROMPT = """
Generate one Playwright TypeScript automation bundle for the supplied structured test
case. Include a Gherkin feature and a Playwright .spec.ts script. Prefer accessible
role/label/test-id locators, environment baseURL, API setup where supported, isolated
data, and assertions matching expected results. Use only relative paths under
features/ or tests/. Code must compile. List every assumption explicitly.
""".strip()
