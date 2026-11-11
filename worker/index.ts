// Noggin? server (Phase 6): passkey sign-in on the shared Innova Space accounts, and thought sync.
// Accounts (users, credentials, sessions, challenges) are the same tables Nudge! uses in D1 `nudge`, so one passkey
// (RP ID innovaspace.app) works in every app. Noggin?'s rows live in their own tables (noggin_rows, noggin_rev):
// Nudge!'s sync pulls everything in `rows`, so Noggin? never writes there.
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database; // the shared `nudge` database
  RP_ID: string;
}

const COOKIE = 'noggin_s';
const YEAR = 365 * 864e5;
const b64u = {
  enc: (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
const rid = () => b64u.enc(crypto.getRandomValues(new Uint8Array(18)));
const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(init.headers ?? {}) } });
const oops = (status: number, error: string) => json({ error }, { status });

let ready: Promise<unknown> | null = null;
function schema(db: D1Database) {
  // Shared account tables: same definitions as Nudge! (IF NOT EXISTS, so nothing changes when they're there).
  ready ??= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at INTEGER, rev INTEGER DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, user_id TEXT, public_key TEXT, counter INTEGER, transports TEXT, created_at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, challenge TEXT, user_id TEXT, expires_at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS noggin_rev (user_id TEXT PRIMARY KEY, rev INTEGER DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS noggin_rows (user_id TEXT, tbl TEXT, id TEXT, data TEXT, rev INTEGER, PRIMARY KEY (user_id, tbl, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS noggin_rows_rev ON noggin_rows (user_id, rev)'),
  ]).catch((e) => { ready = null; throw e; });
  return ready;
}

async function userOf(req: Request, env: Env): Promise<string | null> {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const row = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(m[1]).first<{ user_id: string; expires_at: number }>();
  return row && row.expires_at > Date.now() ? row.user_id : null;
}
async function startSession(env: Env, userId: string) {
  const token = rid() + rid();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, userId, Date.now() + YEAR).run();
  return `${COOKIE}=${token}; Path=/; Max-Age=${YEAR / 1000}; HttpOnly; Secure; SameSite=Lax`;
}
async function takeChallenge(env: Env, id: string) {
  const c = await env.DB.prepare('SELECT challenge, user_id, expires_at FROM challenges WHERE id = ?').bind(id).first<{ challenge: string; user_id: string | null; expires_at: number }>();
  await env.DB.prepare('DELETE FROM challenges WHERE id = ? OR expires_at < ?').bind(id, Date.now()).run();
  return c && c.expires_at > Date.now() ? c : null;
}
/** The name this account uses in Nudge! (from its synced settings row), so signing in can skip the name step. */
async function nudgeName(env: Env, uid: string): Promise<string> {
  const r = await env.DB.prepare("SELECT data FROM rows WHERE user_id = ? AND tbl = 'settings' LIMIT 1").bind(uid).first<{ data: string }>().catch(() => null);
  try { return String(JSON.parse(r?.data ?? '{}').name ?? '').slice(0, 32); } catch { return ''; }
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  await schema(env.DB);
  const path = url.pathname.slice(4);
  const h = url.hostname, onHome = h === env.RP_ID || h.endsWith(`.${env.RP_ID}`);
  const rpID = onHome ? env.RP_ID : h, origin = url.origin;
  const body = req.method === 'POST' ? await req.json<any>().catch(() => ({})) : {};
  const uid = await userOf(req, env);

  if (path === '/health') return json({ ok: true, app: 'noggin', phase: 6 });

  // ── Passkeys (one account across Innova Space) ──
  if (path === '/auth/register/options') {
    const userId = uid ?? rid();
    const existing = uid ? (await env.DB.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').bind(uid).all<{ id: string; transports: string }>()).results : [];
    const nm = String(body.name || 'Innova Space').slice(0, 60);
    const options = await generateRegistrationOptions({
      rpName: 'Innova Space', rpID, userName: nm, userDisplayName: nm,
      userID: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>, attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: JSON.parse(c.transports || '[]') })),
    });
    const cid = rid();
    await env.DB.prepare('INSERT INTO challenges (id, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(cid, options.challenge, userId, Date.now() + 5 * 60e3).run();
    return json({ cid, options });
  }
  if (path === '/auth/register/verify') {
    const c = await takeChallenge(env, body.cid);
    if (!c?.user_id) return oops(400, 'expired');
    const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false }).catch(() => null);
    if (!v?.verified || !v.registrationInfo) return oops(400, 'not-verified');
    const cr = v.registrationInfo.credential;
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO users (id, created_at, rev) VALUES (?, ?, 0)').bind(c.user_id, Date.now()),
      env.DB.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(cr.id, c.user_id, b64u.enc(cr.publicKey), cr.counter, JSON.stringify(cr.transports ?? []), Date.now()),
    ]);
    return json({ ok: true, userId: c.user_id }, { headers: { 'set-cookie': await startSession(env, c.user_id) } });
  }
  if (path === '/auth/login/options') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
    const cid = rid();
    await env.DB.prepare('INSERT INTO challenges (id, challenge, user_id, expires_at) VALUES (?, ?, NULL, ?)').bind(cid, options.challenge, Date.now() + 5 * 60e3).run();
    return json({ cid, options });
  }
  if (path === '/auth/login/verify') {
    const c = await takeChallenge(env, body.cid);
    if (!c) return oops(400, 'expired');
    const cred = await env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(body.response?.id ?? '').first<{ id: string; user_id: string; public_key: string; counter: number; transports: string }>();
    if (!cred) return oops(404, 'unknown-passkey');
    const v = await verifyAuthenticationResponse({
      response: body.response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
      credential: { id: cred.id, publicKey: b64u.dec(cred.public_key) as Uint8Array<ArrayBuffer>, counter: cred.counter, transports: JSON.parse(cred.transports || '[]') },
    }).catch(() => null);
    if (!v?.verified) return oops(400, 'not-verified');
    await env.DB.prepare('UPDATE credentials SET counter = ? WHERE id = ?').bind(v.authenticationInfo.newCounter, cred.id).run();
    return json({ ok: true, userId: cred.user_id, name: await nudgeName(env, cred.user_id) }, { headers: { 'set-cookie': await startSession(env, cred.user_id) } });
  }
  if (path === '/auth/logout') {
    const m = (req.headers.get('cookie') ?? '').match(new RegExp(`${COOKIE}=([^;]+)`));
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(m[1]).run();
    return json({ ok: true }, { headers: { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (path === '/me') return json({ signedIn: !!uid, userId: uid });

  if (!uid) return oops(401, 'signed-out');

  // ── Sync: push changed rows, then pull everything newer than `since` (same protocol as Nudge!) ──
  if (path === '/sync') {
    const rows: { t: string; id: string; d: string | null }[] = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
    await env.DB.prepare('INSERT OR IGNORE INTO noggin_rev (user_id, rev) VALUES (?, 0)').bind(uid).run();
    let rev = (await env.DB.prepare('SELECT rev FROM noggin_rev WHERE user_id = ?').bind(uid).first<{ rev: number }>())?.rev ?? 0;
    if (rows.length) {
      rev = (await env.DB.prepare('UPDATE noggin_rev SET rev = rev + 1 WHERE user_id = ? RETURNING rev').bind(uid).first<{ rev: number }>())!.rev;
      const stmt = env.DB.prepare('INSERT INTO noggin_rows (user_id, tbl, id, data, rev) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, tbl, id) DO UPDATE SET data = excluded.data, rev = excluded.rev');
      for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50).map((r) => stmt.bind(uid, String(r.t).slice(0, 40), String(r.id).slice(0, 80), r.d, rev)));
    }
    const since = Number(body.since) || 0;
    const out = (await env.DB.prepare('SELECT tbl AS t, id, data AS d, rev FROM noggin_rows WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 20000').bind(uid, since).all()).results;
    return json({ rev, rows: out });
  }
  return oops(404, 'not-found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); } catch { return oops(500, 'server'); }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
