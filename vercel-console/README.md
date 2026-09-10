# Quality Forge web console

React-powered Vercel control panel for the Agentic RAG QA repository. React,
ReactDOM, and HTM are vendored as pinned browser assets, so deployment does not
require a framework build step.

- Upload or paste requirement sources.
- Choose OpenAI GPT, OpenAI Codex, Claude, Gemini, NVIDIA NIM, Groq, Mistral,
  OpenRouter, or the offline deterministic demonstration.
- Verify an API key and load the compatible generation models returned for that
  provider account; model names are not hardcoded.
- Use one provider dropdown and one account-aware model dropdown.
- Switch between persistent day and night themes; only the theme preference is
  stored on the device.
- Configure model, environment URL, retrieval, chunking, temperature, output limit,
  browsers, and approval gate.
- Review plan, strategy, scenarios, test cases, traceability, and generated scripts.
- Pass reviewed artifacts through a visible human hard gate before automation.
- Download a complete JSON artifact bundle.

The API key is kept only in React memory, transmitted to the same-origin Vercel
function over HTTPS, and never logged, downloaded, or persisted.
The server function sets `Cache-Control: no-store` and returns redacted errors.

Claude and Gemini can inspect hosted PDF/image uploads directly. The other hosted
providers consume TXT, Markdown, JSON, CSV, or pasted criteria. The local Python
pipeline remains the full DOCX ingestion path. The console generates automation
artifacts; browser execution remains in the repository's Playwright/GitHub Actions
runner because Vercel functions are not a browser execution environment.

## Run and verify

```powershell
python -m http.server 8008
node test.mjs
node smoke-live.mjs https://your-project.vercel.app
```

## Deploy

Create a Vercel project with `vercel-console/` as its root directory, or run the
Vercel CLI from this folder. No environment variables are required: users can select
offline mock mode or provide an Anthropic key for one in-memory session.
