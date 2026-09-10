import { readFileSync } from 'node:fs';
import handler from './api/pipeline.mjs';
import { verifyAndList } from './api/models.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
for (const [, id] of client.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Client references missing UI control #${id}.`);
}
if (/sessionStorage/.test(client) || /localStorage[^\n]*(?:apiKey|credential)/i.test(client)) throw new Error('The client must not persist session data or API keys.');
if (!client.includes("localStorage.setItem('quality-forge-theme',theme)")) throw new Error('Theme preference persistence is missing.');
if (!client.includes('id="provider"') || !client.includes('id="model"')) throw new Error('Provider and model dropdowns are required.');
if (client.includes('React console v2')) throw new Error('Deprecated header label is still present.');
if (!client.includes('Human hard gate') || !client.includes('Nishikant')) throw new Error('Hard gate or footer branding is missing.');
for (const provider of ['OpenAI GPT', 'OpenAI Codex', 'Claude', 'Gemini', 'NVIDIA NIM', 'Groq', 'Mistral', 'OpenRouter']) {
  if (!client.includes(provider)) throw new Error(`Missing React provider option: ${provider}.`);
}

const fakeModelsFetch = async () => ({
  ok: true,
  status: 200,
  async json() {
    return { data: [
      { id: 'gpt-test' },
      { id: 'gpt-test-codex' },
      { id: 'text-embedding-test' },
    ] };
  },
});
const gptModels = await verifyAndList('openai', 'gpt', 'sk-test-abcdefghijklmnop', fakeModelsFetch);
const codexModels = await verifyAndList('openai', 'codex', 'sk-test-abcdefghijklmnop', fakeModelsFetch);
if (gptModels.models.map((item) => item.id).join() !== 'gpt-test') throw new Error('GPT model filtering failed.');
if (codexModels.models.map((item) => item.id).join() !== 'gpt-test-codex') throw new Error('Codex model filtering failed.');

function invoke(body) {
  return new Promise((resolve, reject) => {
    const response = {
      code: 200,
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.code = code; return this; },
      json(payload) {
        if (this.code >= 400) reject(new Error(payload.error));
        else resolve({ code: this.code, headers: this.headers, payload });
      },
    };
    Promise.resolve(handler({ method: 'POST', headers: { host: 'localhost' }, body }, response)).catch(reject);
  });
}

const config = {
  provider: 'mock',
  model: 'deterministic-mock-v1',
  baseUrl: 'https://staging.example.test',
  environment: 'staging',
  retrievalK: 6,
  chunkSize: 1600,
  browsers: ['chromium', 'firefox', 'webkit'],
  approvalGate: true,
};

const designResponse = await invoke({
  phase: 'design',
  config,
  documents: [{
    name: 'sample.md',
    mediaType: 'text/markdown',
    encoding: 'text',
    content: 'REQ-AUTH-001 — The system shall allow a valid customer to sign in.',
  }],
});

if (designResponse.payload.artifacts.requirements[0].id !== 'REQ-AUTH-001') {
  throw new Error('Requirement extraction failed.');
}
if (designResponse.headers['cache-control'] !== 'no-store, max-age=0') {
  throw new Error('No-store response header is missing.');
}

const automationResponse = await invoke({
  phase: 'automation',
  config,
  design: designResponse.payload.artifacts,
});

if (automationResponse.payload.automation.bundles.length !== 1) {
  throw new Error('Automation bundle generation failed.');
}
if (automationResponse.payload.traceability[0].coverage_status !== 'covered') {
  throw new Error('Traceability did not reach covered status.');
}

console.log('Offline design, approval handoff, automation, and traceability checks passed.');
