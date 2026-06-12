"use client";

import { useEffect, useState } from "react";
import {
  getActiveUsers,
  getHistory,
  getLeaderboard,
  usingSupabase,
  type HistoryEntry,
  type LeaderboardEntry,
} from "@/lib/store";

// ---- Demo data (toggle on the page) — 35 fake 2026 teammates, seeded so it's
// stable across reloads. Real users always override a demo person by name. ----
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_NAMES = [
  "Lucía", "Sofía", "Marc", "Guille", "Amara", "Tomás", "Yuki", "Priya", "Leo", "Emma",
  "Noah", "Olivia", "Kai", "Zara", "Mateo", "Inés", "Hugo", "Chloe", "Arjun", "Maya",
  "Felix", "Nora", "Diego", "Alice", "Pablo", "Hannah", "Ravi", "Mia", "Oscar", "Carmen",
  "Theo", "Aisha", "Doomscroll Dan", "TikTok Tina", "Hackathon Dave",
];

const DEMO_BOARD: LeaderboardEntry[] = (() => {
  const rnd = mulberry32(2026);
  const board = DEMO_NAMES.map((name) => {
    const dedication = rnd();
    const sessionsCompleted = Math.floor(3 + rnd() * 20);
    const cleanSessions = Math.min(
      Math.floor(sessionsCompleted * (0.25 + dedication * 0.7)),
      sessionsCompleted
    );
    const totalViolations = Math.floor((1 - dedication) * 28 + rnd() * 5);
    const phoneViolations = Math.floor(totalViolations * (0.4 + rnd() * 0.4));
    return {
      name,
      totalViolations,
      phoneViolations,
      tabViolations: totalViolations - phoneViolations,
      sessionsCompleted,
      cleanSessions,
      currentStreak: dedication > 0.75 ? 3 + Math.floor(rnd() * 12) : Math.floor(rnd() * 3),
    };
  });
  // guaranteed comedy + a clear hero
  const fix = (name: string, patch: Partial<LeaderboardEntry>) => {
    const e = board.find((b) => b.name === name)!;
    Object.assign(e, patch);
  };
  fix("Lucía", { totalViolations: 1, phoneViolations: 0, tabViolations: 1, sessionsCompleted: 21, cleanSessions: 19, currentStreak: 14 });
  fix("Doomscroll Dan", { totalViolations: 34, phoneViolations: 11, tabViolations: 23, sessionsCompleted: 4, cleanSessions: 0, currentStreak: 0 });
  fix("TikTok Tina", { totalViolations: 29, phoneViolations: 26, tabViolations: 3, sessionsCompleted: 5, cleanSessions: 1, currentStreak: 0 });
  fix("Hackathon Dave", { totalViolations: 26, phoneViolations: 17, tabViolations: 9, sessionsCompleted: 2, cleanSessions: 0, currentStreak: 0 });
  return board;
})();

const DEMO_ACTIVE = ["Lucía", "Marc", "Priya", "Doomscroll Dan"];

// fake personal activity so the heatmap looks like a winner's GitHub: dense
// green all over 2026, the occasional red slip
const DEMO_HISTORY: HistoryEntry[] = (() => {
  const rnd = mulberry32(7);
  const out: HistoryEntry[] = [];
  const days = Math.floor((Date.now() - new Date("2026-01-01T00:00:00").getTime()) / 86_400_000) + 1;
  for (let day = 0; day < days; day++) {
    const n = rnd() < 0.88 ? 1 + Math.floor(rnd() * 4) : 0;
    for (let k = 0; k < n; k++) {
      out.push({
        id: `demo-h-${day}-${k}`,
        started_at: new Date(Date.now() - day * 86_400_000).toISOString(),
        planned_minutes: 25,
        completed: true,
        violations: rnd() < 0.12 ? 1 + Math.floor(rnd() * 2) : 0,
      });
    }
  }
  return out;
})();

// ---- GitHub-style contribution heatmap: green = completed sessions, red dot = busts ----
function Heatmap({ history }: { history: HistoryEntry[] }) {
  const byDay = new Map<string, { sessions: number; busts: number }>();
  for (const h of history) {
    const key = h.started_at.slice(0, 10);
    const cur = byDay.get(key) ?? { sessions: 0, busts: 0 };
    if (h.completed) cur.sessions++;
    cur.busts += h.violations;
    byDay.set(key, cur);
  }
  // all of 2026, Jan 1 → today
  const start = new Date("2026-01-01T00:00:00").getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0); // noon anchor dodges DST drift
  const cells = [];
  for (let t = start + 12 * 3_600_000; t <= today.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({ key, ...(byDay.get(key) ?? { sessions: 0, busts: 0 }) });
  }
  const color = (n: number) =>
    n === 0 ? "bg-zinc-800" : n === 1 ? "bg-emerald-800" : n === 2 ? "bg-emerald-600" : "bg-emerald-400";
  return (
    <div className="space-y-2">
      <div className="grid grid-flow-col grid-rows-7 gap-1 w-fit mx-auto">
        {cells.map((c) => (
          <div
            key={c.key}
            title={`${c.key} — ${c.sessions} session${c.sessions === 1 ? "" : "s"}, ${c.busts} bust${c.busts === 1 ? "" : "s"}`}
            className={`relative h-3 w-3 rounded-[2px] ${color(c.sessions)}`}
          >
            {c.busts > 0 && (
              <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600 text-center">
        2026 · <span className="text-emerald-500">green</span> = focus sessions ·{" "}
        <span className="text-red-500">red dot</span> = you broke
      </p>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function WallOfShame() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeUsers, setActiveUsers] = useState<Set<string>>(new Set());
  const [myName, setMyName] = useState("");
  const [demoMode, setDemoMode] = useState(true);

  useEffect(() => {
    const name = localStorage.getItem("pj_name") ?? "";
    setMyName(name);
    setDemoMode(localStorage.getItem("pj_demo") !== "0");
    let alive = true;
    async function load() {
      const [board, hist, active] = await Promise.all([
        getLeaderboard().catch(() => []),
        name ? getHistory(name).catch(() => []) : Promise.resolve([]),
        getActiveUsers().catch(() => new Set<string>()),
      ]);
      if (alive) {
        setEntries(board);
        setHistory(hist);
        setActiveUsers(active);
      }
    }
    void load();
    const iv = setInterval(load, 5000); // poor man's realtime
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  function toggleDemo() {
    const next = !demoMode;
    setDemoMode(next);
    localStorage.setItem("pj_demo", next ? "1" : "0");
  }

  // merge: real users always win over a demo person with the same name
  const realNames = new Set((entries ?? []).map((e) => e.name));
  const board = demoMode
    ? [...(entries ?? []), ...DEMO_BOARD.filter((d) => !realNames.has(d.name))]
    : (entries ?? []);
  const shameBoard = [...board].sort((a, b) => b.totalViolations - a.totalViolations).slice(0, 12);
  const gloryBoard = [...board]
    .sort((a, b) => b.cleanSessions - a.cleanSessions || b.sessionsCompleted - a.sessionsCompleted)
    .slice(0, 12);
  const mergedActive = demoMode ? new Set([...activeUsers, ...DEMO_ACTIVE]) : activeUsers;
  const heatmapHistory = demoMode ? [...history, ...DEMO_HISTORY] : history;

  const nameCell = (name: string) => (
    <span className="inline-flex items-center gap-2">
      {name}
      {name === myName && <span className="text-[10px] text-zinc-500">(you)</span>}
      {mergedActive.has(name) && (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          in jail now
        </span>
      )}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col items-center px-6 py-12 gap-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold">🏆 Glory &amp; 🔥 Shame</h1>
        <p className="text-zinc-500">
          Your team&apos;s finest heroes and worst offenders, live.{" "}
          {!usingSupabase && <span className="text-amber-500">(local mode — only this browser)</span>}
        </p>
        {usingSupabase && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <svg viewBox="0 0 109 113" className="h-4 w-4" aria-hidden="true">
              <path
                d="M63.708 110.284c-2.86 3.601-8.658 1.628-8.727-2.97l-1.007-67.251h45.22c8.19 0 12.758 9.46 7.665 15.874l-43.151 54.347Z"
                fill="#3ECF8E"
                opacity="0.6"
              />
              <path
                d="M45.317 2.071c2.86-3.601 8.657-1.628 8.726 2.97l.442 67.251H9.83c-8.19 0-12.759-9.46-7.665-15.875L45.317 2.072Z"
                fill="#3ECF8E"
              />
            </svg>
            <span>
              Live from <span className="text-[#3ECF8E] font-semibold">Supabase</span> — every client
              (web, Mac app, extension) writes to the same table
            </span>
          </div>
        )}
        <button
          onClick={toggleDemo}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            demoMode
              ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
              : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
          }`}
        >
          🎭 Demo data: {demoMode ? "ON" : "OFF"}
        </button>
      </div>

      {entries === null ? (
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
      ) : (
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-6 items-start">
          <div className="overflow-hidden rounded-xl border border-yellow-500/30">
            <div className="bg-yellow-500/10 px-4 py-3 font-bold text-yellow-300">🏆 Wall of Glory</div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Hero</th>
                  <th className="text-right px-4 py-2">✅ Done</th>
                  <th className="text-right px-4 py-2">🧼 Clean</th>
                  <th className="text-right px-4 py-2">🔥 Streak</th>
                </tr>
              </thead>
              <tbody>
                {gloryBoard.map((e, i) => (
                  <tr
                    key={e.name}
                    className={`border-t border-zinc-800/60 ${i === 0 ? "bg-yellow-500/5" : ""}`}
                  >
                    <td className="px-4 py-2.5">{MEDALS[i] ?? <span className="text-zinc-600">{i + 1}</span>}</td>
                    <td className="px-4 py-2.5 font-medium">{nameCell(e.name)}</td>
                    <td className="px-4 py-2.5 text-right">{e.sessionsCompleted}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">{e.cleanSessions}</td>
                    <td className="px-4 py-2.5 text-right">
                      {e.currentStreak > 0 ? `🔥 ${e.currentStreak}` : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-red-500/30">
            <div className="bg-red-500/10 px-4 py-3 font-bold text-red-300">🔥 Wall of Shame</div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Offender</th>
                  <th className="text-right px-4 py-2">📱 Phone</th>
                  <th className="text-right px-4 py-2">🌐 Tabs</th>
                  <th className="text-right px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {shameBoard.map((e, i) => (
                  <tr
                    key={e.name}
                    className={`border-t border-zinc-800/60 ${i === 0 ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      {i === 0 && e.totalViolations > 0 ? "👑" : <span className="text-zinc-600">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{nameCell(e.name)}</td>
                    <td className="px-4 py-2.5 text-right">{e.phoneViolations}</td>
                    <td className="px-4 py-2.5 text-right">{e.tabViolations}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold ${
                        e.totalViolations > 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {e.totalViolations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-700">
        Refreshes every 5 seconds. 👑 = team&apos;s biggest disappointment · 🥇 = focus royalty.
      </p>

      {myName && (
        <div className="w-full max-w-2xl space-y-4">
          <h2 className="text-xl font-bold text-center">📜 Your year in jail, {myName}</h2>
          <Heatmap history={heatmapHistory} />
        </div>
      )}
    </div>
  );
}
