"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getTotalViolations, usingSupabase } from "@/lib/store";
import { pairExtension } from "@/lib/extension";
import { preloadDetector } from "@/lib/detector";

const AUTH0_ORANGE = "#EB5424";

function Auth0Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M21.98 7.448 19.62 0H4.347L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12.007 24l6.157-4.552c3.755-2.81 5.182-7.688 3.816-12.015l-6.16 4.58 2.343 7.45-6.157-4.597-6.158 4.58 2.358-7.433-6.188-4.55 7.63-.045L12.008 0l2.356 7.404 7.615.044-6.174 4.638z" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [auth, setAuth] = useState<"unknown" | "unavailable" | "logged-out" | "logged-in">("unknown");
  const [betrayals, setBetrayals] = useState<number | null>(null);

  useEffect(() => {
    void preloadDetector().catch(() => {}); // warm the model + WebGPU in the background
    void getTotalViolations().then(setBetrayals).catch(() => {});
    const saved = localStorage.getItem("pj_name") ?? "";
    setName(saved);
    if (saved) pairExtension(saved); // extension still pairs silently if someone has it
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

  function start(asName: string) {
    const trimmed = asName.trim();
    if (!trimmed) return;
    localStorage.setItem("pj_name", trimmed);
    pairExtension(trimmed);
    router.push("/focus");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10">
      <div className="space-y-4 max-w-xl text-center">
        <h1 className="text-6xl font-bold tracking-tight">📵 Phone Jail</h1>
        <p className="text-zinc-400 text-lg">
          Your webcam watches for your phone —{" "}
          <span className="text-zinc-200">100% in your browser, no frames ever leave your machine</span>.
          Get caught, and a deeply disappointed parent voice lets your whole team know.
        </p>
        {betrayals !== null && betrayals > 0 && (
          <p className="text-zinc-500">
            <span className="text-red-400 font-bold text-3xl tabular-nums">{betrayals}</span>{" "}
            betrayals logged so far
          </p>
        )}
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl space-y-5">
        {auth === "logged-in" ? (
          <div className="space-y-4 text-center">
            <Auth0Logo className="h-10 w-10 mx-auto" />
            <p className="text-zinc-300">
              Welcome back, <span className="font-semibold text-white">{name}</span>
            </p>
            <button
              onClick={() => start(name)}
              className="w-full px-4 py-3.5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-lg transition-colors"
            >
              Lock me in
            </button>
            <a href="/auth/logout" className="block text-xs text-zinc-500 hover:text-zinc-300">
              Not you? Log out
            </a>
          </div>
        ) : (
          <>
            {auth !== "unavailable" && (
              <>
                <a
                  href="/auth/login"
                  className="flex items-center justify-center gap-3 w-full px-4 py-3.5 rounded-lg font-bold text-lg text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: AUTH0_ORANGE }}
                >
                  <Auth0Logo className="h-6 w-6" />
                  Continue with Auth0
                </a>
                <div className="flex items-center gap-3 text-xs text-zinc-600">
                  <div className="flex-1 h-px bg-zinc-800" />
                  or get shamed anonymously
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              </>
            )}
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start(name)}
                placeholder="Your name (for the Wall of Shame)"
                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-700 focus:border-zinc-400 outline-none text-center"
              />
              <button
                onClick={() => start(name)}
                disabled={!name.trim()}
                className="w-full px-4 py-3 rounded-lg border border-zinc-700 hover:border-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
              >
                Continue as guest
              </button>
            </div>
          </>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2 border-t border-zinc-800/70 text-[11px] text-zinc-500">
          <Auth0Logo className="h-3 w-3" />
          Secured by <span className="font-semibold text-zinc-300">Auth0</span>
          <span className="text-zinc-700">·</span>
          {usingSupabase ? "Data by Supabase" : "Local mode"}
        </div>
      </div>

      <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-left space-y-2">
        <h2 className="font-semibold">🍎 The enforcer: Phone Jail for Mac</h2>
        <p className="text-sm text-zinc-400">
          A menu bar app that watches your focus sessions (Supabase is the source of truth) and{" "}
          <span className="text-zinc-200">kills YouTube, Reddit, X &amp; TikTok tabs in Chrome the
          second you open them</span> — voice shaming included, every attempt logged to the Wall of
          Shame.
        </p>
        <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
          <li>
            <a href="/downloads/PhoneJail.dmg" className="text-red-400 underline hover:text-red-300">
              Download PhoneJail.dmg
            </a>{" "}
            and drag the app anywhere
          </li>
          <li>
            Unsigned hackathon build: if macOS complains, System Settings → Privacy &amp; Security →{" "}
            <span className="text-zinc-300">Open Anyway</span> (or build it yourself:{" "}
            <code className="text-zinc-300">./macos/build.sh</code> in the repo)
          </li>
          <li>Click 📵 in the menu bar → set the same name you use here. Done.</li>
        </ol>
      </div>
    </div>
  );
}
