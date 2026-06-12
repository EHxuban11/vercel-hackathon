// Turns a roast line into speech with ElevenLabs TTS (flash model = low latency).
// Returns 503 when ELEVENLABS_API_KEY is missing so the client can fall back
// to pre-generated audio or browser speech.

import { NextRequest, NextResponse } from "next/server";

// Daniel — deep, British, perfect disappointed-dad energy
const DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 503 });
  }

  const { text } = await req.json();
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
    const detail = await res.text();
    return NextResponse.json({ error: "elevenlabs failed", detail }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
