// Noggin? server. Phase 1: static assets only, plus /api/health.
// Phase 6 adds passkeys (shared accounts in D1 `nudge`) and sync (D1 `noggin`); Phase 7 adds the Nudge! handoff.
interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, app: 'noggin', phase: 1 }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'not-yet' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
