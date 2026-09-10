const PROVIDERS = {
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models?limit=1000', auth: 'anthropic' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', auth: 'gemini' },
  nvidia: { url: 'https://integrate.api.nvidia.com/v1/models', auth: 'bearer' },
  groq: { url: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: 'bearer', verifyUrl: 'https://openrouter.ai/api/v1/key' }
};

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('x-content-type-options', 'nosniff');
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST required.' });
  try {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) return response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const provider = String(body?.provider || '');
    const family = String(body?.family || '');
    const apiKey = String(body?.apiKey || '').trim();
    const result = await verifyAndList(provider, family, apiKey);
    return response.status(200).json(result);
  } catch (error) {
    return response.status(Number(error.status) || 400).json({ error: safeMessage(error) });
  }
}

export async function verifyAndList(provider, family, apiKey, fetchImpl = fetch) {
  if (provider === 'mock') return { verified: true, provider, models: [{ id: 'offline-deterministic', name: 'Offline deterministic engine', capabilities: ['QA design', 'Automation'] }] };
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error('Unsupported AI provider.');
  if (apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error('Enter a valid API key for this provider.');
  const headers = authHeaders(spec.auth, apiKey);
  if (spec.verifyUrl) await fetchJson(spec.verifyUrl, headers, fetchImpl);
  const payload = await fetchJson(spec.url, headers, fetchImpl);
  const models = normalizeModels(provider, family, payload);
  if (!models.length) {
    const error = new Error(family === 'codex' ? 'The key is valid, but no Codex models are available to this account.' : 'The key is valid, but no compatible generation models were returned.');
    error.status = 422;
    throw error;
  }
  return { verified: true, provider, models };
}

function authHeaders(type, apiKey) {
  if (type === 'anthropic') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (type === 'gemini') return { 'x-goog-api-key': apiKey };
  return { authorization: `Bearer ${apiKey}` };
}

async function fetchJson(url, headers, fetchImpl) {
  const result = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15_000) });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(providerError(payload, result.status));
    error.status = [401, 403, 429].includes(result.status) ? result.status : 502;
    throw error;
  }
  return payload;
}

function providerError(payload, status) {
  const raw = payload?.error?.message || payload?.message || payload?.detail;
  if (status === 401 || status === 403) return 'The provider rejected this API key or it lacks permission.';
  if (status === 429) return 'The provider rate limit was reached. Try again shortly.';
  return typeof raw === 'string' ? raw.slice(0, 300) : `The provider returned status ${status}.`;
}

export function normalizeModels(provider, family, payload) {
  const source = Array.isArray(payload) ? payload : (payload?.data || payload?.models || []);
  const models = source.map((item) => {
    const rawId = String(item?.id || item?.name || '');
    const id = provider === 'gemini' ? rawId.replace(/^models\//, '') : rawId;
    const actions = item?.supportedGenerationMethods || item?.supported_actions || [];
    const context = item?.context_window || item?.max_context_length || item?.inputTokenLimit || item?.max_input_tokens || item?.context_length || null;
    const capabilities = [];
    if (actions.includes('generateContent')) capabilities.push('Generate content');
    if (item?.capabilities?.vision || item?.capabilities?.image_input?.supported || item?.architecture?.input_modalities?.includes('image')) capabilities.push('Vision');
    if (item?.capabilities?.function_calling || item?.capabilities?.structured_outputs?.supported) capabilities.push('Structured output');
    return { id, name: String(item?.display_name || item?.displayName || item?.name || id).replace(/^models\//, ''), context, capabilities, raw: item };
  }).filter((item) => item.id && isGenerationModel(provider, family, item));

  const unique = [...new Map(models.map(({raw, ...item}) => [item.id, item])).values()];
  return unique.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500);
}

function isGenerationModel(provider, family, item) {
  const id = item.id.toLowerCase();
  const raw = item.raw || {};
  if (provider === 'openai') {
    const excluded = /embedding|moderation|whisper|transcri|tts|audio|realtime|image|sora|dall-e|search|guard/.test(id);
    if (family === 'codex') return id.includes('codex') && !excluded;
    return !id.includes('codex') && !excluded && (/^gpt[-_/]/.test(id) || /^o\d/.test(id) || id.startsWith('chatgpt'));
  }
  if (provider === 'gemini') {
    const actions = raw.supportedGenerationMethods || raw.supported_actions || [];
    return (!actions.length || actions.includes('generateContent')) && !/embedding|aqa|imagen|veo|tts|live/.test(id);
  }
  if (provider === 'groq') return raw.active !== false && !/whisper|guard/.test(id);
  if (provider === 'mistral') return raw.archived !== true && raw.capabilities?.completion_chat !== false && !/embed|moderation|ocr|transcri/.test(id);
  if (provider === 'openrouter') return !raw.architecture?.output_modalities || raw.architecture.output_modalities.includes('text');
  return !/embed|rerank|guard|moderation|whisper|transcri|tts|image|video/.test(id);
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : 'Model verification failed.';
  return message.replace(/(?:sk|nvapi|gsk|AIza)[-_A-Za-z0-9]{12,}/g, '[redacted]').slice(0, 500);
}
