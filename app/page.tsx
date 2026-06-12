"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usingSupabase } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    setName(localStorage.getItem("pj_name") ?? "");
  }, []);

  function start() {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("pj_name", trimmed);
    router.push("/focus");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-8">
      <div className="space-y-4 max-w-xl">
        <h1 className="text-5xl font-bold tracking-tight">📵 Phone Jail</h1>
        <p className="text-zinc-400 text-lg">
          Start a focus session. Your webcam watches for your phone —{" "}
          <span className="text-zinc-200">100% in your browser, no frames ever leave your machine</span>.
          Get caught, and a deeply disappointed parent voice lets you (and your whole team) know.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="Your name (for the Wall of Shame)"
          className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 focus:border-zinc-400 outline-none text-center"
        />
        <button
          onClick={start}
          disabled={!name.trim()}
          className="w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          Lock me in
        </button>
        <p className="text-xs text-zinc-600">
          {usingSupabase ? "Streaks synced via Supabase" : "Local mode — Supabase not configured yet"}
        </p>
      </div>
    </div>
  );
}
