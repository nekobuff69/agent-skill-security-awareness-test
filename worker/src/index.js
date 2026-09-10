// Cloudflare Worker — LLM proxy (ADR-0007, ADR-0008)
// Rate-limits per IP, enforces CORS, forwards requests to an upstream LLM endpoint.
// API key is read from Worker secrets (env) — never logged or exposed.

const RATE_LIMIT = 10;
const WINDOW_MS = 3600000; // 1 hour
// Owner decision 2026-09-10: 20s default upstream budget (was 8s per ADR-0007
// — amended). Configurable via env for slower providers (LM Studio, Ollama on
// local hardware) without client changes (ADR-0008).
const UPSTREAM_TIMEOUT_MS_DEFAULT = 20000;

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, resets on Worker restart — acceptable at hobby scale)
// ---------------------------------------------------------------------------
const ipCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return { ok: true };
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
function getCorsHeaders(env, origin) {
  // Default-deny: unset ALLOWED_ORIGIN means no origin may use the proxy
  // (ADR-0007: allow-list is the Pages origin only). '*' must be set
  // explicitly by the operator (local dev only).
  const allowed = (env.ALLOWED_ORIGIN || '').trim();
  const isAllowed = allowed === '*' || (allowed !== '' && origin === allowed);

  if (!isAllowed) return null;

  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function logStatus(ip, status) {
  // Truncate IP to first two octets for privacy
  const truncated = ip.replace(/\.\d+\.\d+$/, '.x.x');
  console.log(`${new Date().toISOString()} ${truncated} ${status}`);
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // --- CORS preflight ---------------------------------------------------
    if (request.method === 'OPTIONS') {
      const cors = getCorsHeaders(env, origin);
      if (!cors) return jsonResponse(403, { error: { message: 'Origin not allowed', status: 403 } });
      return new Response(null, { status: 204, headers: cors });
    }

    // --- CORS origin check ------------------------------------------------
    const cors = getCorsHeaders(env, origin);
    if (!cors) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      logStatus(ip, 403);
      return jsonResponse(403, { error: { message: 'Origin not allowed', status: 403 } });
    }

    // Only POST is supported
    if (request.method !== 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      logStatus(ip, 405);
      return jsonResponse(405, { error: { message: 'Method not allowed', status: 405 } }, cors);
    }

    // --- Rate limit -------------------------------------------------------
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.ok) {
      logStatus(clientIp, 429);
      return jsonResponse(
        429,
        { error: { message: 'Rate limit exceeded', status: 429 } },
        { ...cors, 'Retry-After': String(rateCheck.retryAfter) },
      );
    }

    // --- Parse request body -----------------------------------------------
    let body;
    try {
      body = await request.json();
    } catch {
      logStatus(clientIp, 400);
      return jsonResponse(400, { error: { message: 'Invalid JSON body', status: 400 } }, cors);
    }

    // --- Upstream request -------------------------------------------------
    const endpoint = env.LLM_ENDPOINT;
    const apiKey = env.LLM_API_KEY;

    if (!endpoint || !apiKey) {
      logStatus(clientIp, 500);
      return jsonResponse(500, { error: { message: 'Upstream not configured', status: 500 } }, cors);
    }

    // ADR-0008: the model name lives server-side — override whatever the
    // client sent so provider switching needs no client changes.
    if (env.LLM_MODEL) {
      body.model = env.LLM_MODEL;
    }

    const controller = new AbortController();
    const upstreamTimeoutMs = parseInt(env.UPSTREAM_TIMEOUT_MS, 10) || UPSTREAM_TIMEOUT_MS_DEFAULT;
    const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);

    try {
      const upstreamResp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      logStatus(clientIp, upstreamResp.status);

      // Structured error path: non-OK status or non-JSON body → 502 with
      // a static error object. Never expose upstream body text, API key,
      // or prompt content.
      if (upstreamResp.status >= 400) {
        return jsonResponse(502, { error: { message: 'Upstream error', status: 502 } }, cors);
      }

      let upstreamBody;
      try {
        upstreamBody = await upstreamResp.json();
      } catch {
        return jsonResponse(502, { error: { message: 'Upstream error', status: 502 } }, cors);
      }

      // Successful upstream response — pass through unchanged.
      return jsonResponse(upstreamResp.status, upstreamBody, cors);
    } catch (err) {
      clearTimeout(timer);
      logStatus(clientIp, 502);
      // Never expose the API key, prompt content, or internal error details.
      return jsonResponse(502, { error: { message: 'Upstream error', status: 502 } }, cors);
    }
  },
};
