/**
 * Chronicle Security Proxy — Cloudflare Worker
 *
 * Sits between the Chronicle browser app and the GitHub Contents API.
 * The GitHub PAT never leaves this Worker — the browser only sends the
 * Chronicle session password (X-Chronicle-Auth), which the Worker validates.
 *
 * Environment variables (set via `wrangler secret put`):
 *   GITHUB_PAT       — GitHub Personal Access Token with `repo` scope
 *   CHRONICLE_PASS   — Chronicle session password (default: chronicle2026)
 */

const GH_API = 'https://api.github.com';

// Origins allowed to call this Worker
const ALLOWED_ORIGINS = [
  'https://rayyanali722-cmyk.github.io',
  'http://localhost:3457',
  'http://127.0.0.1:3457',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Chronicle-Auth',
      'Access-Control-Max-Age': '86400',
    };

    // ── CORS preflight ────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Auth check ────────────────────────────────────────────────────────
    const expectedPass = env.CHRONICLE_PASS || 'chronicle2026';
    const providedPass = request.headers.get('X-Chronicle-Auth') || '';

    if (providedPass !== expectedPass) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── Route validation ──────────────────────────────────────────────────
    // Only allow /github/* paths to prevent open proxy abuse
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/github/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Strip /github prefix → forward to GitHub API
    const ghPath = url.pathname.replace(/^\/github/, '') + url.search;
    const ghURL = `${GH_API}${ghPath}`;

    // ── Forward to GitHub ─────────────────────────────────────────────────
    const ghHeaders = {
      'Authorization': `token ${env.GITHUB_PAT}`,
      'User-Agent': 'chronicle-proxy/1.0',
      'Accept': 'application/vnd.github.v3+json',
    };

    let body = undefined;
    if (request.method === 'PUT' || request.method === 'POST') {
      const text = await request.text();
      body = text;
      ghHeaders['Content-Type'] = 'application/json';
    }

    const ghRes = await fetch(ghURL, {
      method: request.method,
      headers: ghHeaders,
      body,
    });

    const responseText = await ghRes.text();

    return new Response(responseText, {
      status: ghRes.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Chronicle-Proxy': '1',
        ...corsHeaders,
      },
    });
  },
};
