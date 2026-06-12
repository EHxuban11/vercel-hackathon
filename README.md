# 📵 Phone Jail

Your webcam catches you holding your phone during a focus session (YOLOv8n COCO, class 67 "cell phone",
running **100% in the browser** with ONNX Runtime Web). A deeply disappointed parent voice (ElevenLabs)
shames you out loud. Supabase tracks your streaks and a live **Wall of Shame** of your team's worst offenders.

Switching tabs mid-session counts too — YouTube and Reddit are being watched.

## Run it

```bash
npm install
npm run dev
```

Works out of the box with zero config:
- **No Supabase?** → localStorage (single-browser leaderboard)
- **No ElevenLabs key?** → browser speechSynthesis fallback

## Wire up the real stuff

### Supabase (streaks + Wall of Shame)
1. Create a project (or use the Vercel Marketplace integration, which injects env vars automatically).
2. Paste `supabase/schema.sql` into the SQL editor.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` / Vercel.

### ElevenLabs (the disappointed parent)
- Set `ELEVENLABS_API_KEY` → `/api/roast` generates **contextual** roasts live with `eleven_flash_v2_5`
  ("You had a 4-session streak going. You just threw it in the trash.")
- Optionally pre-generate the canned phrases for zero-latency playback:
  ```bash
  ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs en
  ```
  mp3s land in `public/audio/` and are used as fallback if the live API is slow.

## Privacy (the good pitch line)

Camera frames **never leave the browser** — inference is local WASM. Only violation *events*
(timestamp + type) are stored.

## The enforcer: Phone Jail for Mac

`macos/` — a Swift menu bar app (build: `./macos/build.sh`, or grab `/downloads/PhoneJail.dmg` from the
site). It polls Supabase for your active focus session and, while one is running, kills distracting
Chrome tabs (YouTube, Reddit, X, TikTok…) every 2 seconds, plays the ElevenLabs shame audio, and logs
the violation to the same `violations` table — so it shows up in the session timeline and the Wall of
Shame. The web app is the source of truth; the Mac app is just the muscle.

(There's also a Chrome extension in `extension/` that does the same with declarativeNetRequest —
kept as a cross-platform bonus.)

## Architecture

- `lib/detector.ts` — YOLOv8n ONNX in-browser, letterboxed 640×640, cell-phone class only,
  4-consecutive-frame debounce + 15s cooldown against false positives
- `lib/roast.ts` — contextual roast templates (streak just died, repeat offender, caught in <2 min…)
- `lib/speech.ts` — voice fallback chain: live ElevenLabs → pre-generated mp3 → speechSynthesis
- `lib/store.ts` — Supabase when configured, localStorage otherwise
- `app/focus` — session screen (timer, webcam, Page Visibility tab-snitching)
- `app/shame` — Wall of Shame leaderboard (polls every 5s)
