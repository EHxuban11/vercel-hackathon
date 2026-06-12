// Voice output with graceful degradation:
// 1. /api/roast → ElevenLabs TTS of the contextual roast (needs ELEVENLABS_API_KEY)
// 2. pre-generated mp3 in /public/audio (run scripts/generate-voices.mjs)
// 3. browser speechSynthesis (always works, sounds robotic — last resort)

import type { Lang } from "./phrases";

let pregenAvailable: boolean | null = null;

async function hasPregeneratedAudio(): Promise<boolean> {
  if (pregenAvailable !== null) return pregenAvailable;
  try {
    const res = await fetch("/audio/phone-1.mp3", { method: "HEAD" });
    pregenAvailable = res.ok && (res.headers.get("content-type")?.includes("audio") ?? false);
  } catch {
    pregenAvailable = false;
  }
  return pregenAvailable;
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio failed"));
    audio.play().catch(reject);
  });
}

function speakFallback(text: string, lang: Lang) {
  if (typeof speechSynthesis === "undefined") return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang === "es" ? "es-ES" : "en-GB";
  utter.rate = 0.92;
  utter.pitch = 0.7; // lower pitch ≈ more disappointed
  const voices = speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.startsWith(utter.lang) && /male|daniel|jorge|diego/i.test(v.name));
  if (match) utter.voice = match;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/**
 * Say a contextual roast out loud. `text` is the roast line (already built
 * client-side), `phraseId` an optional canned-phrase id for the pregen fallback.
 */
export async function sayRoast(text: string, lang: Lang, phraseId?: string) {
  // 1. live ElevenLabs TTS via our API route
  try {
    const res = await fetch("/api/roast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        await playUrl(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      return;
    }
  } catch {
    // fall through
  }

  // 2. pre-generated mp3
  if (phraseId && (await hasPregeneratedAudio())) {
    try {
      await playUrl(`/audio/${phraseId}.mp3`);
      return;
    } catch {
      // fall through
    }
  }

  // 3. browser TTS
  speakFallback(text, lang);
}
