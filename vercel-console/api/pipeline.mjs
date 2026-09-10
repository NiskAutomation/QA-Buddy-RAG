const MAX_BODY_CHARS = 9_000_000;
const textTypes = new Set(['text/plain', 'text/markdown', 'application/json', 'text/csv']);
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('x-content-type-options', 'nosniff');
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST required' });
  try {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) return response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    if (!body || JSON.stringify(body).length > MAX_BODY_CHARS) return response.status(413).json({ error: 'Request is too large.' });
    const phase = body.phase;
    const config = validateConfig(body.config);
    if (phase === 'design') {
      const documents = validateDocuments(body.documents);
      const artifacts = config.provider === 'mock'
        ? buildMockDesign(documents, config)
        : await generateDesign(body.apiKey, documents, config);
      validateDesign(artifacts);
      return response.status(200).json({ artifacts });
    }
    if (phase === 'automation') {
      validateDesign(body.design);
      const automation = config.provider === 'mock'
        ? buildMockAutomation(body.design, config)
        : await generateAutomation(body.apiKey, body.design, config);
      validateAutomation(automation, body.design.test_cases);
      const traceability = buildTraceability(body.design, automation);
      return response.status(200).json({ automation, traceability });
    }
    return response.status(400).json({ error: 'Unknown pipeline phase.' });
  } catch (error) {
    const status = Number(error.status) || 400;
    return response.status(status).json({ error: safeMessage(error) });
  }
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : 'Pipeline failed.';
  return message.replace(/(?:sk|nvapi|gsk|AIza)[A-Za-z0-9_-]{12,}/g, '[redacted]').slice(0, 500);
}

function validateConfig(raw = {}) {
  const supportedProviders = new Set(['mock', 'openai', 'anthropic', 'gemini', 'nvidia', 'groq', 'mistral', 'openrouter']);
  const provider = String(raw.provider || '');
  if (!supportedProviders.has(provider)) throw new Error('Unsupported AI provider.');
  const model = String(raw.model || '').trim();
  // Provider-qualified IDs use forward slashes, and some catalogs use a
  // colon suffix (for example `openai/gpt-oss-120b` or `model:free`).
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/.test(model) || model.length > 160) {
    throw new Error('Invalid model identifier.');
  }
  let baseUrl;
  try { baseUrl = new URL(String(raw.baseUrl)).toString(); } catch { throw new Error('Invalid test environment URL.'); }
  const browsers = Array.isArray(raw.browsers) ? raw.browsers.filter((item) => ['chromium', 'firefox', 'webkit', 'mobile-chrome'].includes(item)) : [];
  if (!browsers.length) throw new Error('At least one browser is required.');
  return {
    provider, model, baseUrl, browsers,
    environment: String(raw.environment || 'staging').slice(0, 40),
    retrievalK: Math.max(2, Math.min(12, Number(raw.retrievalK) || 6)),
    chunkSize: Math.max(500, Math.min(4000, Number(raw.chunkSize) || 1600)),
    approvalGate: raw.approvalGate !== false,
    temperature: Math.max(0, Math.min(1, Number(raw.temperature) || 0)),
    maxOutputTokens: Math.max(1024, Math.min(32768, Number(raw.maxOutputTokens) || 8192)),
    framework: 'Playwright + TypeScript + Cucumber',
    reporting: 'Allure + Playwright HTML',
  };
}

function validateDocuments(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('At least one requirement source is required.');
  return raw.slice(0, 12).map((document) => {
    const name = String(document.name || 'source').replace(/[\\/\0]/g, '_').slice(0, 160);
    const mediaType = String(document.mediaType || 'application/octet-stream').slice(0, 100);
    const encoding = document.encoding === 'base64' ? 'base64' : 'text';
    const content = String(document.content || '');
    if (!content || content.length > 7_000_000) throw new Error(`${name}: empty or too large.`);
    return { name, mediaType, encoding, content };
  });
}

function sourceText(documents) {
  return documents.filter((doc) => doc.encoding === 'text').map((doc) => `# ${doc.name}\n${doc.content}`).join('\n\n');
}

function buildMockDesign(documents, config) {
  const text = sourceText(documents) || 'REQ-DEMO-001 The uploaded source shall produce a traceable QA design.';
  const matches = [...text.matchAll(/\bREQ-[A-Z0-9][A-Z0-9-]*\b/g)];
  const ids = [...new Set(matches.map((match) => match[0]))];
  if (!ids.length) ids.push('REQ-GEN-001');
  const requirements = ids.map((id, index) => ({ id, title: titleFor(id, text), statement: statementFor(id, text), kind: id.includes('NFR') ? 'non_functional' : 'functional', source: documents[index % documents.length].name, ambiguities: [] }));
  const scenarios = requirements.map((requirement, index) => ({ id: `SCN-${String(index + 1).padStart(3, '0')}`, title: `Verify ${requirement.title}`, objective: requirement.statement, priority: index === 0 ? 'critical' : 'high', requirement_ids: [requirement.id], tags: [index === 0 ? '@smoke' : '@regression'] }));
  const testCases = scenarios.map((scenario, index) => ({ id: `TC-${String(index + 1).padStart(3, '0')}`, scenario_id: scenario.id, title: scenario.title, preconditions: [`${config.environment} is reachable`, 'Test data is isolated'], steps: [{ number: 1, action: 'Open the configured application', expected: 'Target is reachable' }, { number: 2, action: scenario.objective, expected: 'The requirement is satisfied' }], expected_result: 'All step-level expectations are met.', priority: scenario.priority, test_type: 'e2e', tags: scenario.tags, requirement_ids: scenario.requirement_ids, data: {} }));
  return {
    requirements,
    test_plan: { title: 'Requirements-driven QA plan', scope_in: requirements.map((r) => r.title), scope_out: ['Production destructive testing'], objectives: ['Verify every normalized requirement', 'Preserve end-to-end traceability'], entry_criteria: ['Requirements are readable', 'Target environment is available'], exit_criteria: ['Critical cases pass', 'Every requirement maps to a script'], risks: ['Ambiguous source behavior', 'Environment or test-data drift'], environments: [config.environment], requirement_ids: ids },
    test_strategy: { approach: 'Risk-based API/UI hybrid automation with isolated data.', levels: ['unit', 'api', 'ui', 'e2e'], browsers: config.browsers, retrieval: { top_k: config.retrievalK, chunk_target: config.chunkSize }, framework: config.framework, reporting: config.reporting, quality_gates: ['Schema validation', 'Human test-case approval', 'Critical tests pass'] },
    scenarios,
    test_cases: testCases,
    traceability: requirements.map((requirement, index) => ({ requirement_id: requirement.id, scenario_ids: [scenarios[index].id], test_case_ids: [testCases[index].id], script_files: [], coverage_status: 'missing_script' })),
  };
}

function titleFor(id, text) {
  const line = text.split(/\r?\n/).find((item) => item.includes(id)) || id;
  return line.replace(id, '').replace(/^[\s—–:.-]+/, '').slice(0, 90) || id;
}

function statementFor(id, text) {
  const at = text.indexOf(id);
  return (at >= 0 ? text.slice(at + id.length).split(/\n\s*\n|\r?\n(?=REQ-)/)[0] : text).replace(/^[\s—–:.-]+/, '').trim().slice(0, 1200);
}

function buildMockAutomation(design, config) {
  return { bundles: design.test_cases.map((testCase) => ({
    case_id: testCase.id,
    assumptions: ['Accessible labels or test IDs are available on the target application.'],
    files: [
      { path: `features/${testCase.id}.feature`, content: `@generated ${testCase.tags.join(' ')}\nFeature: ${testCase.title}\n  Scenario: ${testCase.id} ${testCase.title}\n    Given the configured application is available\n    When the ${testCase.id} flow is executed\n    Then the documented expectations are satisfied\n` },
      { path: `tests/${testCase.id}.spec.ts`, content: `import { test, expect } from '@playwright/test';\n\ntest('${testCase.id}: ${testCase.title.replace(/'/g, "\\'")}', async ({ page }) => {\n  await page.goto('${config.baseUrl}');\n  // Implement target-specific actions from the validated test-case steps.\n  await expect(page).toHaveURL(/.*/);\n});\n` },
    ],
  })) };
}

function buildTraceability(design, automation) {
  return design.requirements.map((requirement) => {
    const scenarios = design.scenarios.filter((scenario) => scenario.requirement_ids.includes(requirement.id));
    const cases = design.test_cases.filter((testCase) => testCase.requirement_ids.includes(requirement.id));
    const scripts = automation.bundles.filter((bundle) => cases.some((testCase) => testCase.id === bundle.case_id)).flatMap((bundle) => bundle.files.filter((file) => file.path.endsWith('.ts')).map((file) => file.path));
    return { requirement_id: requirement.id, scenario_ids: scenarios.map((item) => item.id), test_case_ids: cases.map((item) => item.id), script_files: scripts, coverage_status: scripts.length ? 'covered' : 'missing_script' };
  });
}

const CHAT_ENDPOINTS = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

async function generateDesign(apiKey, documents, config) {
  const system = 'You are a senior QA architect. Extract atomic requirements, preserve source truth, and return only valid JSON matching the supplied schema. Every ID link must be valid. Missing details become explicit ambiguities.';
  if (config.provider === 'anthropic') return anthropic(apiKey, system, designContent(documents, config), designTool(), config);
  if (config.provider === 'gemini') return gemini(apiKey, system, geminiDesignParts(documents, config), designTool(), config);
  if (config.provider === 'openai') return openAIResponses(apiKey, system, openAIDesignInput(documents, config), designTool(), config);
  const evidence = sourceText(documents);
  if (!evidence.trim()) {
    const error = new Error('This provider needs TXT, Markdown, JSON, CSV, or pasted criteria. For direct PDF, DOCX, and image analysis, choose OpenAI GPT/Codex, Claude, or Gemini with a compatible model.');
    error.status = 422;
    throw error;
  }
  const prompt = `Configuration:\n${JSON.stringify(config, null, 2)}\n\nRequirement evidence:\n${evidence}`;
  return chatJson(apiKey, system, prompt, designTool(), config);
}

async function generateAutomation(apiKey, design, config) {
  const system = 'You generate compile-ready Playwright TypeScript and Cucumber Gherkin from validated test cases. Return only valid JSON matching the supplied schema. Do not invent secrets. List assumptions. Use safe relative paths only.';
  const prompt = `Configuration:\n${JSON.stringify(config)}\n\nValidated design:\n${JSON.stringify(design)}`;
  if (config.provider === 'anthropic') return anthropic(apiKey, system, [{ type: 'text', text: prompt }], automationTool(), config);
  if (config.provider === 'gemini') return gemini(apiKey, system, [{ text: prompt }], automationTool(), config);
  return config.provider === 'openai'
    ? openAIResponses(apiKey, system, prompt, automationTool(), config)
    : chatJson(apiKey, system, prompt, automationTool(), config);
}

async function anthropic(apiKey, system, userContent, tool, config) {
  const key = String(apiKey || '').trim();
  validateKey(key);
  const result = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key },
    body: JSON.stringify({ model: config.model, max_tokens: config.maxOutputTokens, temperature: config.temperature, system, messages: [{ role: 'user', content: userContent }], tools: [tool], tool_choice: { type: 'tool', name: tool.name } }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!result.ok) {
    const body = await result.json().catch(() => ({}));
    const error = new Error(body?.error?.message || `Anthropic request failed (${result.status}).`);
    error.status = result.status === 401 ? 401 : 502;
    throw error;
  }
  const body = await result.json();
  const block = body.content?.find((item) => item.type === 'tool_use' && item.name === tool.name);
  if (!block?.input) throw new Error('The model did not return a structured artifact.');
  return block.input;
}

function designContent(documents, config) {
  const content = [{ type: 'text', text: `Configuration:\n${JSON.stringify(config, null, 2)}\n\nCreate a complete QA design grounded only in the attached evidence. Do not invent missing behavior.` }];
  for (const document of documents) {
    if (document.encoding === 'text' || textTypes.has(document.mediaType)) content.push({ type: 'text', text: `SOURCE ${document.name}:\n${document.content}` });
    else if (document.mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: document.content }, title: document.name });
    else if (imageTypes.has(document.mediaType)) content.push({ type: 'image', source: { type: 'base64', media_type: document.mediaType, data: document.content } });
    else content.push({ type: 'text', text: `SOURCE ${document.name}: binary DOCX content is not expanded in the hosted console. Record a blocking ambiguity requesting PDF, Markdown, or text evidence.` });
  }
  return content;
}

function geminiDesignParts(documents, config) {
  const parts = [{ text: `Configuration:\n${JSON.stringify(config, null, 2)}\n\nCreate a complete QA design grounded only in the supplied evidence.` }];
  for (const document of documents) {
    if (document.encoding === 'text' || textTypes.has(document.mediaType)) parts.push({ text: `SOURCE ${document.name}:\n${document.content}` });
    else if (document.mediaType === 'application/pdf' || imageTypes.has(document.mediaType)) parts.push({ inline_data: { mime_type: document.mediaType, data: document.content } });
    else parts.push({ text: `SOURCE ${document.name}: DOCX is not expanded in hosted mode. Record a blocking ambiguity requesting PDF or text evidence.` });
  }
  return parts;
}

export function openAIDesignInput(documents, config) {
  const content = [{
    type: 'input_text',
    text: `Configuration:\n${JSON.stringify(config, null, 2)}\n\nCreate a complete QA design grounded only in the supplied evidence. Do not invent missing behavior.`,
  }];
  for (const document of documents) {
    const mediaType = fileMediaType(document);
    if (document.encoding === 'text' || textTypes.has(mediaType)) {
      content.push({ type: 'input_text', text: `SOURCE ${document.name}:\n${document.content}` });
    } else if (imageTypes.has(mediaType)) {
      content.push({ type: 'input_image', image_url: `data:${mediaType};base64,${document.content}`, detail: 'high' });
    } else if (mediaType === 'application/pdf' || mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      content.push({
        type: 'input_file',
        filename: document.name,
        file_data: `data:${mediaType};base64,${document.content}`,
        ...(mediaType === 'application/pdf' ? { detail: 'high' } : {}),
      });
    } else {
      content.push({ type: 'input_text', text: `SOURCE ${document.name}: unsupported binary format. Record a blocking ambiguity requesting PDF, DOCX, image, Markdown, or text evidence.` });
    }
  }
  return [{ role: 'user', content }];
}

function fileMediaType(document) {
  const mediaType = String(document.mediaType || '').toLowerCase();
  if (mediaType && mediaType !== 'application/octet-stream') return mediaType;
  if (/\.pdf$/i.test(document.name)) return 'application/pdf';
  if (/\.docx$/i.test(document.name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.png$/i.test(document.name)) return 'image/png';
  if (/\.jpe?g$/i.test(document.name)) return 'image/jpeg';
  if (/\.webp$/i.test(document.name)) return 'image/webp';
  return mediaType || 'application/octet-stream';
}

async function gemini(apiKey, system, parts, tool, config) {
  const key = String(apiKey || '').trim();
  validateKey(key);
  const model = encodeURIComponent(config.model.replace(/^models\//, ''));
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: `${system}\nReturn a JSON object matching this schema:\n${JSON.stringify(tool.input_schema)}` }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxOutputTokens, responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(55_000),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw providerFailure(body, result.status, 'Gemini');
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  return parseJson(text, 'Gemini');
}

async function openAIResponses(apiKey, system, prompt, tool, config) {
  const key = String(apiKey || '').trim();
  validateKey(key);
  const schemaInstruction = `Return one JSON object matching this schema:\n${JSON.stringify(tool.input_schema)}`;
  const input = Array.isArray(prompt)
    ? prompt.map((message, index) => index === prompt.length - 1
      ? { ...message, content: [...message.content, { type: 'input_text', text: schemaInstruction }] }
      : message)
    : `${prompt}\n\n${schemaInstruction}`;
  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: config.model, instructions: system, input, max_output_tokens: config.maxOutputTokens, store: false, text: { format: { type: 'json_object' } } }),
    signal: AbortSignal.timeout(55_000),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw providerFailure(body, result.status, 'OpenAI');
  const text = body.output_text || body.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  return parseJson(text, 'OpenAI');
}

async function chatJson(apiKey, system, prompt, tool, config) {
  const key = String(apiKey || '').trim();
  validateKey(key);
  const endpoint = CHAT_ENDPOINTS[config.provider];
  if (!endpoint) throw new Error('This provider does not have a generation adapter.');
  const baseBody = { model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: `${prompt}\n\nReturn one JSON object matching this schema:\n${JSON.stringify(tool.input_schema)}` }], temperature: config.temperature, max_tokens: config.maxOutputTokens };
  let result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ ...baseBody, response_format: { type: 'json_object' } }), signal: AbortSignal.timeout(55_000) });
  if (result.status === 400) result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(baseBody), signal: AbortSignal.timeout(55_000) });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw providerFailure(body, result.status, config.provider);
  const content = body.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((item) => item.text || '').join('') : content;
  return parseJson(text, config.provider);
}

function parseJson(value, provider) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${provider} returned no structured output.`);
  const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { throw new Error(`${provider} returned malformed JSON. Try a model with structured-output support.`); }
}

function validateKey(key) {
  if (key.length < 16 || key.length > 512 || /\s/.test(key)) throw new Error('A valid provider API key is required.');
}

function providerFailure(body, status, provider) {
  const raw = body?.error?.message || body?.message || body?.detail;
  const error = new Error(status === 401 || status === 403 ? `${provider} rejected the API key or model permission.` : (typeof raw === 'string' ? raw.slice(0, 350) : `${provider} request failed (${status}).`));
  error.status = status === 401 || status === 403 ? status : status === 429 ? 429 : 502;
  return error;
}

function designTool() {
  const requirement = { type: 'object', additionalProperties: false, required: ['id', 'title', 'statement', 'kind', 'source', 'ambiguities'], properties: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string' }, kind: { enum: ['functional', 'non_functional', 'business_rule', 'unknown'] }, source: { type: 'string' }, ambiguities: { type: 'array', items: { type: 'string' } } } };
  const scenario = { type: 'object', additionalProperties: false, required: ['id', 'title', 'objective', 'priority', 'requirement_ids', 'tags'], properties: { id: { type: 'string' }, title: { type: 'string' }, objective: { type: 'string' }, priority: { enum: ['critical', 'high', 'medium', 'low'] }, requirement_ids: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } } } };
  const step = { type: 'object', additionalProperties: false, required: ['number', 'action', 'expected'], properties: { number: { type: 'integer' }, action: { type: 'string' }, expected: { type: 'string' } } };
  const testCase = { type: 'object', additionalProperties: false, required: ['id', 'scenario_id', 'title', 'preconditions', 'steps', 'expected_result', 'priority', 'test_type', 'tags', 'requirement_ids', 'data'], properties: { id: { type: 'string' }, scenario_id: { type: 'string' }, title: { type: 'string' }, preconditions: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: step }, expected_result: { type: 'string' }, priority: { enum: ['critical', 'high', 'medium', 'low'] }, test_type: { enum: ['unit', 'api', 'ui', 'e2e'] }, tags: { type: 'array', items: { type: 'string' } }, requirement_ids: { type: 'array', items: { type: 'string' } }, data: { type: 'object', additionalProperties: { type: 'string' } } } };
  const trace = { type: 'object', additionalProperties: false, required: ['requirement_id', 'scenario_ids', 'test_case_ids', 'script_files', 'coverage_status'], properties: { requirement_id: { type: 'string' }, scenario_ids: { type: 'array', items: { type: 'string' } }, test_case_ids: { type: 'array', items: { type: 'string' } }, script_files: { type: 'array', items: { type: 'string' } }, coverage_status: { enum: ['covered', 'missing_scenario', 'missing_case', 'missing_script'] } } };
  return { name: 'emit_qa_design', description: 'Emit the complete structured QA design.', input_schema: { type: 'object', additionalProperties: false, required: ['requirements', 'test_plan', 'test_strategy', 'scenarios', 'test_cases', 'traceability'], properties: { requirements: { type: 'array', minItems: 1, items: requirement }, test_plan: { type: 'object' }, test_strategy: { type: 'object' }, scenarios: { type: 'array', items: scenario }, test_cases: { type: 'array', items: testCase }, traceability: { type: 'array', items: trace } } } };
}

function automationTool() {
  return { name: 'emit_automation', description: 'Emit generated feature and Playwright source files.', input_schema: { type: 'object', additionalProperties: false, required: ['bundles'], properties: { bundles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['case_id', 'assumptions', 'files'], properties: { case_id: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, files: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } } } } } } } };
}

function validateDesign(design) {
  if (!design || !Array.isArray(design.requirements) || !design.requirements.length) throw new Error('No requirements were generated.');
  for (const key of ['scenarios', 'test_cases', 'traceability']) if (!Array.isArray(design[key])) throw new Error(`Invalid ${key} artifact.`);
  const requirementIds = new Set(design.requirements.map((item) => item.id));
  const scenarioIds = new Set(design.scenarios.map((item) => item.id));
  if ([...requirementIds].some((id) => !/^REQ-[A-Z0-9][A-Z0-9-]*$/.test(id))) throw new Error('Invalid requirement ID returned by model.');
  for (const scenario of design.scenarios) if (!scenario.requirement_ids?.every((id) => requirementIds.has(id))) throw new Error(`Scenario ${scenario.id} has an invalid requirement link.`);
  for (const testCase of design.test_cases) if (!scenarioIds.has(testCase.scenario_id) || !testCase.requirement_ids?.every((id) => requirementIds.has(id))) throw new Error(`Test case ${testCase.id} has an invalid traceability link.`);
}

function validateAutomation(automation, testCases) {
  if (!automation || !Array.isArray(automation.bundles)) throw new Error('Invalid automation artifact.');
  const caseIds = new Set(testCases.map((item) => item.id));
  for (const bundle of automation.bundles) {
    if (!caseIds.has(bundle.case_id) || !Array.isArray(bundle.files)) throw new Error('Automation references an unknown test case.');
    for (const file of bundle.files) if (!/^(features|tests)\/[A-Za-z0-9._/-]+$/.test(file.path) || file.path.includes('..')) throw new Error('Unsafe generated file path.');
  }
}
