/**
 * Share2PDF fetch helper (Cloudflare Worker, free plan is enough).
 *
 * Why it exists: claude.ai does not allow other websites (like your GitHub Pages
 * app) to read share data directly, so the browser blocks it. This tiny worker
 * fetches the public share data for you and hands it back with the headers the
 * browser needs.
 *
 * Setup (about 3 minutes, works from a phone browser):
 *   1. dash.cloudflare.com > Workers & Pages > Create > Create Worker > Deploy.
 *   2. Tap Edit code, delete everything, paste this whole file, tap Deploy.
 *   3. Copy the worker address (https://something.yourname.workers.dev).
 *   4. In Share2PDF: Settings > Fetching > Fetch helper address > paste it.
 *   5. Test: open  <worker address>/?id=<the 36 characters after /share/>  in a browser.
 *      If you see JSON, it works. If you see {"error":"blocked"...}, claude.ai is
 *      refusing automatic requests; Share2PDF falls back to copy and paste.
 *
 * It only ever requests claude.ai/api/chat_snapshots/<uuid>, nothing else.
 * To restrict it to your own app, set ALLOWED_ORIGIN to e.g. 'https://yourname.github.io'.
 */
const ALLOWED_ORIGIN = '*';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept, content-type',
  'access-control-max-age': '86400',
};
const JSON_HEADERS = { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const fail = (obj, status) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return fail({ error: 'method not allowed' }, 405);

    const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID.test(id)) return fail({ error: 'missing or invalid id' }, 400);

    let up;
    try {
      up = await fetch(
        'https://claude.ai/api/chat_snapshots/' + id + '?rendering_mode=messages&render_all_tools=true',
        { headers: { accept: 'application/json' } }
      );
    } catch (e) {
      return fail({ error: 'could not reach claude.ai' }, 502);
    }

    const text = await up.text();
    try { JSON.parse(text); } catch (e) {
      // an HTML challenge page or similar: report it instead of passing it along
      return fail({ error: 'blocked', upstream_status: up.status }, 502);
    }
    return new Response(text, { status: up.status, headers: JSON_HEADERS });
  },
};
