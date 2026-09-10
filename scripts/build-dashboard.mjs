import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const matrixPath = path.join(root, 'artifacts', 'latest', '08-traceability-matrix.json');
const resultsPath = path.join(root, 'automation', 'test-results', 'playwright-results.json');
const publicPath = path.join(root, 'public', 'index.html');
const playwrightReport = path.join(root, 'automation', 'playwright-report');
const allureReport = path.join(root, 'automation', 'allure-report');

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[char]);

const matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
let testSummary = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
if (existsSync(resultsPath)) {
  const results = JSON.parse(await readFile(resultsPath, 'utf8'));
  testSummary = { ...testSummary, ...(results.stats ?? {}) };
}

const rows = matrix.rows ?? [];
const covered = rows.filter((row) => row.coverage_status === 'covered').length;
const coverage = rows.length ? Math.round((covered / rows.length) * 100) : 0;
const renderedRows = rows.map((row) => `<tr>
  <td><code>${escapeHtml(row.requirement_id)}</code></td>
  <td>${escapeHtml(row.scenario_ids.join(', ') || '—')}</td>
  <td>${escapeHtml(row.test_case_ids.join(', ') || '—')}</td>
  <td>${escapeHtml(row.script_files.join(', ') || '—')}</td>
  <td><span class="pill ${escapeHtml(row.coverage_status)}">${escapeHtml(row.coverage_status.replaceAll('_', ' '))}</span></td>
</tr>`).join('\n');

const reportLinks = [
  existsSync(playwrightReport) ? '<a href="/playwright/">Open Playwright HTML report</a>' : '',
  existsSync(allureReport) ? '<a href="/allure/">Open Allure report</a>' : '',
].filter(Boolean).join(' · ');

const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agentic QA Dashboard</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{margin:0;background:#07111f;color:#dbeafe}main{max-width:1180px;margin:auto;padding:48px 24px}h1{font-size:clamp(2rem,5vw,4rem);letter-spacing:-.04em;margin:0 0 8px}.muted{color:#93a4ba}a{color:#67e8f9}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:32px 0}.card{background:#0d1b2e;border:1px solid #20344e;border-radius:16px;padding:22px;box-shadow:0 12px 35px #0005}.metric{font-size:2rem;font-weight:750;color:#67e8f9}.table-wrap{overflow-x:auto}table{width:100%;min-width:780px;border-collapse:collapse}th,td{text-align:left;padding:14px 12px;border-bottom:1px solid #20344e;vertical-align:top}th{color:#93c5fd;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}code{color:#a5f3fc}.pill{display:inline-block;padding:5px 9px;border-radius:999px;font-size:.75rem;background:#26364b}.covered{color:#86efac;background:#14532d66}.missing_script,.missing_case,.missing_scenario{color:#fde68a;background:#713f1266}
</style></head><body><main><p class="muted">PLAYWRIGHT · ALLURE · TRACEABILITY</p><h1>Agentic QA dashboard</h1>
${reportLinks ? `<p>${reportLinks}</p>` : ''}
<section class="grid"><div class="card"><div class="metric">${rows.length}</div><div class="muted">Requirements</div></div><div class="card"><div class="metric">${coverage}%</div><div class="muted">Automated coverage</div></div><div class="card"><div class="metric">${testSummary.expected}</div><div class="muted">Tests passed</div></div><div class="card"><div class="metric">${testSummary.unexpected}</div><div class="muted">Tests failed</div></div></section>
<section class="card table-wrap"><h2>Requirement → scenario → case → script</h2><table><thead><tr><th>Requirement</th><th>Scenarios</th><th>Cases</th><th>Scripts</th><th>Status</th></tr></thead><tbody>${renderedRows}</tbody></table></section>
</main></body></html>`;

await mkdir(path.dirname(publicPath), { recursive: true });
if (existsSync(playwrightReport)) await cp(playwrightReport, path.join(root, 'public', 'playwright'), { recursive: true, force: true });
if (existsSync(allureReport)) await cp(allureReport, path.join(root, 'public', 'allure'), { recursive: true, force: true });
await writeFile(publicPath, html, 'utf8');
console.log(`Dashboard written to ${publicPath}`);
