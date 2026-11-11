# Noggin? 1.0

Idea bank PWA by Innova Space: Curiosities (ideas) and Wonderings (questions); steps hand off to Nudge!. Offline first; optional passkey sign-in shared with Nudge! (Phase 6).

## Sources of truth
- **Noggin? Bible v1.0** (Claude Docs, https://claude.ai/artifact/McSTxeGees189Jqxrrh4aK): all logic, data model, build plan. Follow it; ask before changing a decision.
- **Noggin? mockups v1** (artifact, https://claude.ai/artifact/5553HEZEXV5mZTzBBeD8R3): every screen, light and dark; Thoughts rising animation.
- **Nudge! Bible v2.0** and repo chnlprz/nudge: shared stack, rules and the other side of the handoff.

## Stack
Vite + TypeScript (no framework), Dexie over IndexedDB (`src/db`), vite-plugin-pwa, Cloudflare Worker (`worker/index.ts`: /api passkeys + sync) + static assets from `dist/` (`wrangler.jsonc`), custom domain noggin.innovaspace.app. D1 binding `DB` = Nudge!'s `nudge` database: shared accounts (users, credentials, sessions, challenges); Noggin? rows only in `noggin_rows` / `noggin_rev` (never Nudge!'s `rows`, which Nudge! syncs whole). Session cookie `noggin_s`. Handoff to Nudge! (Phase 7): shared `handoffs` table; Noggin? /api/handoff/send, /cancel, /list; Nudge! 2.9 /api/handoff/pending, /status; Nudge! task ids `nog-<handoffId>`.

## Rules
- Colours, sizes, radii only from `src/styles/tokens.css`. Serif via `var(--serif)`, never bold, `opsz 18`.
- Two themes: Dark = Supernova, Light = cream twin, plus Custom. Brand gold #efb94f only for the logo's ?.
- Calm: no points, streaks or red counts. One primary action per screen.
- Phone first, 320–440 px; desktop from 768 px. Respect safe areas, text size and reduced motion.
- Copy: gentle, never blames, says what didn't change on errors.

## Build phases (Bible › Build plan)
1. Foundation ✅ · 2. Thoughts core ✅ · 3. Home extras ✅ · 4. Analytics ✅ · 5. Onboarding, Settings, backups, About ✅ · 6. Account + sync ✅ · 7. Handoff to Nudge! ✅ · 8. Desktop ✅ (built early, Nov 12)

## Open issues
- Dark mode shows horizontal bands only in Chrome on Chanel's Intel Mac (not iPad, phone, or Nudge!). A fixed solid `html::before` layer was tried (Nov 12); not yet confirmed fixed.
