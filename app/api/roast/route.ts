// Turns a roast line into speech with ElevenLabs TTS (flash model = low latency).
// Returns 503 when ELEVENLABS_API_KEY is missing so the client can fall back
// to pre-generated audio or browser speech.

import { NextRequest, NextResponse } from "next/server";

// Daniel — deep, British, perfect disappointed-dad energy
const DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";

// crude per-IP rate limit (per warm lambda) — enough to stop credit-burning loops
const hits = new Map<string, number[]>();
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 503 });
  }

  // browsers always send Origin/Referer on fetch POSTs; curl loops usually don't
  const source = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const allowed = [process.env.APP_BASE_URL ?? "https://phone-jail.vercel.app", "http://localhost"];
  if (!allowed.some((a) => source.startsWith(a))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }

  const { text } = await req.json().catch(() => ({}) as { text?: unknown });
  if (!text || typeof text !== "string" || text.length > 500) {
    return NextResponse.json({ error: "bad text" }, { status: 400 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.6 },
      }),
    }
  );

  if (!res.ok) {
    console.error("elevenlabs error:", res.status, await res.text());
    return NextResponse.json({ error: "tts failed" }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
