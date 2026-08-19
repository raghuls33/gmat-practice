/*
 * GMAT Practice Suite — Worker.
 *
 * Two API routes; everything else falls through to the static assets, so the
 * practice app itself is served exactly as before and keeps working with no
 * JavaScript from this file involved.
 *
 *   POST /api/signup    public. Records one interest signup.
 *   GET  /api/signups   private. Requires a bearer token. Never public: it
 *                       returns other people's names and email addresses.
 */

import { validateSignup, isHoneypotTripped } from './validate.js';

const MAX_BODY = 4096;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

/* Length-independent comparison, so a timing signal cannot be used to recover
   the token a character at a time. */
function tokensMatch(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { tooBig: true };
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    return { bad: true };
  }
}

async function handleSignup(request, env) {
  /* A GET is the front-end asking whether signups actually work here. The
     same app is also served from GitHub Pages and straight off the filesystem,
     where there is no Worker at all and this 404s — the form uses that to
     decide whether to render itself. */
  if (request.method === 'GET') return json({ ready: Boolean(env.DB) });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!env.DB) return json({ error: 'Signups are not configured.' }, 503);

  const body = await readJson(request);
  if (body.tooBig) return json({ error: 'That request was too large.' }, 413);
  if (body.bad) return json({ error: 'Could not read that request.' }, 400);

  /* Answer a bot exactly as we answer a human, so it learns nothing. */
  if (isHoneypotTripped(body.value)) return json({ ok: true });

  const result = validateSignup(body.value);
  if (!result.ok) return json({ error: 'Please check the form.', errors: result.errors }, 422);

  const country = (request.cf && request.cf.country) || null;

  try {
    await env.DB.prepare(
      'INSERT INTO signups (name, email, note, country, created_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(email) DO UPDATE SET name = excluded.name, note = excluded.note'
    ).bind(
      result.value.name,
      result.value.email,
      result.value.note || null,
      country,
      new Date().toISOString()
    ).run();
  } catch (err) {
    return json({ error: 'Could not save that just now. Please try again later.' }, 500);
  }

  return json({ ok: true });
}

async function handleList(request, env) {
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);

  /* Fail closed. With no token configured this endpoint stays shut rather than
     defaulting to open — the failure mode of the alternative is a public dump
     of every subscriber's email address. */
  if (!env.ADMIN_TOKEN) return json({ error: 'Not available.' }, 503);

  const auth = request.headers.get('authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tokensMatch(presented, env.ADMIN_TOKEN)) return json({ error: 'Not authorised.' }, 401);

  if (!env.DB) return json({ error: 'Signups are not configured.' }, 503);

  const rows = await env.DB.prepare(
    'SELECT id, name, email, note, country, created_at FROM signups ORDER BY id DESC'
  ).all();
  const list = rows.results || [];

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'csv') {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = 'id,name,email,note,country,created_at';
    const lines = list.map(r => [r.id, r.name, r.email, r.note, r.country, r.created_at].map(esc).join(','));
    return new Response([head].concat(lines).join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': 'attachment; filename="signups.csv"'
      }
    });
  }

  return json({ count: list.length, signups: list });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/signup') return handleSignup(request, env);
    if (url.pathname === '/api/signups') return handleList(request, env);
    return env.ASSETS.fetch(request);
  }
};
