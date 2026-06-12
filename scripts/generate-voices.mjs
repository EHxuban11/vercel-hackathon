// Pre-generates mp3s for all canned phrases with ElevenLabs TTS.
// Usage: ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs [en|es]
// Output: public/audio/{id}.mp3 — zero-latency playback in the demo.

import { mkdir, writeFile } from "node:fs/promises";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // Daniel
const LANG = process.argv[2] === "es" ? "es" : "en";

if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY first.");
  process.exit(1);
}

// Keep phrases in sync with lib/phrases.ts (plain .mjs script — no TS imports)
const { ALL_PHRASES } = await import("../lib/phrases.ts").catch(async () => {
  // Fallback for plain node: re-read the TS file and eval the arrays crudely
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../lib/phrases.ts", import.meta.url), "utf8");
  const phrases = [...src.matchAll(/id:\s*"([^"]+)",\s*en:\s*"([^"]+)",\s*es:\s*"([^"]+)"/gs)].map(
    (m) => ({ id: m[1], en: m[2], es: m[3] })
  );
  return { ALL_PHRASES: phrases };
});

await mkdir("public/audio", { recursive: true });

for (const phrase of ALL_PHRASES) {
  const text = phrase[LANG];
  process.stdout.write(`${phrase.id}: "${text}" … `);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.6 },
      }),
    }
  );
  if (!res.ok) {
    console.error(`FAILED (${res.status}): ${await res.text()}`);
    continue;
  }
  await writeFile(`public/audio/${phrase.id}.mp3`, Buffer.from(await res.arrayBuffer()));
  console.log("ok");
}
console.log("Done. Audio in public/audio/");
