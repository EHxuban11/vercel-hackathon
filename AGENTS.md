<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Setup: Phone Jail

Focus app that catches phone use via webcam during a focus session. LibreYOLO runs entirely in the browser (no server-side inference). Violations are roasted by an ElevenLabs voice and logged to a shared Wall of Shame.

## Stack

- **Next.js 16** (app router, TypeScript, Tailwind v4)
- **LibreYOLO v1.2.0** - ONNX models served from `/public/models/`, run in-browser via `onnxruntime-web`
- **Supabase** - sessions, violations, streaks (or localStorage fallback when unconfigured)
- **Auth0** - optional login via `@auth0/nextjs-auth0`
- **ElevenLabs** - TTS roasts via `/api/roast`
- **Chrome extension** - Manifest V3, blocks distracting sites via `declarativeNetRequest`
- **Swift macOS menu bar app** - tab killer, Supabase sync

## Project layout

```
app/
  page.tsx              Landing page (name input, Auth0 login, model preload)
  focus/page.tsx        Main focus session (webcam loop, timer, violation logic)
  shame/page.tsx        Wall of Shame leaderboard + heatmap
  api/
    roast/route.ts      ElevenLabs TTS endpoint (rate-limited)
    end-session/route.ts  Beacon receiver for tab-close cleanup
lib/
  detector.ts           PhoneDetector class -- LibreYOLO ONNX inference, WebGPU/WASM
  roast.ts              buildRoast() -- contextual shame lines, no LLM needed
  speech.ts             sayRoast() -- ElevenLabs or pre-generated audio fallback
  store.ts              Supabase data layer (sessions, violations, streaks, leaderboard)
  supabase.ts           Supabase client (null when env vars missing)
  auth0.ts              Auth0 client
  phrases.ts            Canned shame phrases, bilingual (en/es)
  extension.ts          pairExtension() -- pushes username to Chrome extension
extension/              Chrome extension source (load unpacked from here)
macos/                  Swift menu bar app (build with ./macos/build.sh)
public/
  models/               libreyolo9l.onnx (WebGPU, 95 MB), libreyolo9s.onnx (WASM, 45 MB)
  audio/                Pre-generated ElevenLabs mp3s (phone-N.mp3, tab-N.mp3)
supabase/schema.sql     Full DB schema
```

## Local setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local -- all vars are optional, app works without them (localStorage mode)
npm run dev             # http://localhost:3000
```

Required env vars (all optional -- app degrades gracefully):

```
SUPABASE_URL
SUPABASE_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID     # defaults to Daniel (onwK4e9ZLuTAKqWW03F9)
AUTH0_SECRET
AUTH0_BASE_URL
AUTH0_ISSUER_BASE_URL
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
APP_BASE_URL            # used for CORS check in /api/roast
```

## Key invariants

- **No server-side inference.** LibreYOLO runs via `onnxruntime-web` inside the browser. The server never sees video frames.
- **Supabase is optional.** All data falls back to localStorage when `SUPABASE_URL`/`SUPABASE_KEY` are missing. Check `lib/supabase.ts` -- `supabase` is `null` in that case. All store functions branch on `if (supabase)`.
- **Auth0 is optional.** The middleware redirects `/auth/*` routes; when Auth0 env vars are absent the `/auth/profile` fetch returns 404 and the app falls back to anonymous name input.
- **Model loading.** `preloadDetector()` is called on the landing page to warm WebGPU + the 95 MB model before the session starts. Do not move this call.
- **Violation cooldown.** Min gap between violations is `COOLDOWN_MS = 4000 ms`. A new roast interrupts the previous audio. Do not lower this -- it creates a spam loop.
- **Session lifecycle races.** `endSession` is called from `finish()`, `pagehide` beacon, and `visibilitychange`. It is idempotent (Supabase update only fires when `ended_at IS NULL`).

## Regenerate pre-built audio

```bash
ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs en
ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs es
```

## Supabase schema

See `supabase/schema.sql`. Tables: `sessions`, `violations`. Run it in the Supabase SQL editor.
