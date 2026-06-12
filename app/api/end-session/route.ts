// Beacon target: ends a session when the focus tab is closed mid-session.
// sendBeacon can't carry auth headers, so this runs server-side with the
// service role key. Only allows ending (never deleting) a session.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false }, { status: 503 });

  const { sessionId } = await req.json().catch(() => ({}));
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sb = createClient(url, key);
  await sb
    .from("sessions")
    .update({ ended_at: new Date().toISOString(), completed: false })
    .eq("id", sessionId)
    .is("ended_at", null);

  return NextResponse.json({ ok: true });
}
