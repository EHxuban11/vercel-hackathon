"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usingSupabase } from "@/lib/store";
import { extensionInstalled, pairExtension } from "@/lib/extension";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [auth, setAuth] = useState<"unknown" | "unavailable" | "logged-out" | "logged-in">("unknown");
  const [extOk, setExtOk] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("pj_name") ?? "";
    setName(saved);
    if (saved) pairExtension(saved);
    void extensionInstalled().then(setExtOk);
    // Auth0 (when configured) mounts /auth/profile via middleware; 404 = not configured
    fetch("/auth/profile")
      .then(async (res) => {
        if (res.status === 404) return setAuth("unavailable");
        if (!res.ok) return setAuth("logged-out");
        const user = await res.json().catch(() => null);
        if (user?.name || user?.email) {
          const display = (user.name ?? user.email) as string;
          setName(display);
          localStorage.setItem("pj_name", display);
          setAuth("logged-in");
        } else {
          setAuth("logged-out");
        }
      })
      .catch(() => setAuth("unavailable"));
  }, []);

  function start() {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("pj_name", trimmed);
    pairExtension(trimmed);
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
        {auth === "logged-out" && (
          <a href="/auth/login" className="text-sm text-zinc-400 hover:text-white underline">
            or log in with Auth0
          </a>
        )}
        {auth === "logged-in" && (
          <a href="/auth/logout" className="text-xs text-zinc-600 hover:text-zinc-400">
            logged in via Auth0 — log out
          </a>
        )}
        <p className="text-xs text-zinc-600">
          {usingSupabase ? "Streaks synced via Supabase" : "Local mode — Supabase not configured yet"}
        </p>
      </div>

      <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-left space-y-2">
        {extOk ? (
          <>
            <h2 className="font-semibold">🧱 Blocker extension connected ✅</h2>
            <p className="text-sm text-zinc-400">
              YouTube, Reddit, X, TikTok &amp; friends get blocked browser-wide whenever you start a
              focus session. Attempts to visit them go straight to the Wall of Shame.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold">🧱 Want actual blocking? Get the browser extension</h2>
            <p className="text-sm text-zinc-400">
              Blocks YouTube, Reddit, X, TikTok &amp; friends across your whole browser during focus
              sessions — and snitches every attempt to the Wall of Shame. Pairs with this page
              automatically, no setup.
            </p>
            <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
              <li>
                <a
                  href="/downloads/phone-jail-blocker.zip"
                  className="text-red-400 underline hover:text-red-300"
                >
                  Download
                </a>{" "}
                and double-click the zip to unpack it
              </li>
              <li>
                Paste{" "}
                <button
                  onClick={() => navigator.clipboard.writeText("chrome://extensions")}
                  className="font-mono text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded hover:bg-zinc-700"
                  title="Click to copy"
                >
                  chrome://extensions 📋
                </button>{" "}
                in the address bar → flip on <span className="text-zinc-300">Developer mode</span>
              </li>
              <li>
                Drag the <span className="text-zinc-300">phone-jail-blocker</span> folder onto that
                page. Done — refresh here and it pairs itself.
              </li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
