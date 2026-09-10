import assert from 'node:assert/strict';

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) {
  throw new Error('Usage: node smoke-live.mjs https://your-deployment.vercel.app');
}

const page = await fetch(`${baseUrl}/`);
assert.equal(page.status, 200);
assert.match(await page.text(), /Quality Forge/);
assert.match(page.headers.get('content-security-policy') ?? '', /default-src/);

const react = await fetch(`${baseUrl}/vendor/react.production.min.js`);
assert.equal(react.status, 200);

const appSourceResponse = await fetch(`${baseUrl}/app.js`);
assert.equal(appSourceResponse.status, 200);
const appSource = await appSourceResponse.text();
assert.match(appSource, /id="provider"/);
assert.match(appSource, /id="model"/);
assert.match(appSource, /Human hard gate/);
assert.match(appSource, /Nishikant/);
assert.doesNotMatch(appSource, /React console v2/);

const themeCss = await fetch(`${baseUrl}/theme.css`);
assert.equal(themeCss.status, 200);

const catalog = await fetch(`${baseUrl}/api/models`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ provider: 'mock', family: '', apiKey: '' })
});
assert.equal(catalog.status, 200);
const catalogResult = await catalog.json();
assert.equal(catalogResult.models[0].id, 'offline-deterministic');

const api = await fetch(`${baseUrl}/api/pipeline`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    phase: 'design',
    documents: [{
      name: 'smoke-requirement.md',
      mediaType: 'text/markdown',
      encoding: 'text',
      content: 'REQ-CART-001 As a shopper, I can add one in-stock item to my cart and see the correct subtotal.'
    }],
    config: {
      provider: 'mock',
      model: 'offline-deterministic',
      baseUrl: 'https://example.com',
      environment: 'staging',
      retrievalK: 6,
      chunkSize: 900,
      browsers: ['chromium'],
      approvalGate: true
    }
  })
});

assert.equal(api.status, 200);
assert.match(api.headers.get('cache-control') ?? '', /no-store/);
const result = await api.json();
assert.ok(result.artifacts.requirements.length > 0);
assert.ok(result.artifacts.test_cases.length > 0);
console.log(`Live React, model catalog, and pipeline smoke tests passed: ${result.artifacts.requirements.length} requirement(s), ${result.artifacts.test_cases.length} test case(s).`);
