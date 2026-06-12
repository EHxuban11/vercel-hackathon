"use client";

import { useEffect, useState } from "react";
import {
  getHistory,
  getLeaderboard,
  usingSupabase,
  type HistoryEntry,
  type LeaderboardEntry,
} from "@/lib/store";

export default function WallOfShame() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    const name = localStorage.getItem("pj_name") ?? "";
    setMyName(name);
    let alive = true;
    async function load() {
      const [board, hist] = await Promise.all([
        getLeaderboard().catch(() => []),
        name ? getHistory(name).catch(() => []) : Promise.resolve([]),
      ]);
      if (alive) {
        setEntries(board);
        setHistory(hist);
      }
    }
    void load();
    const iv = setInterval(load, 5000); // poor man's realtime
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center px-6 py-12 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">🔥 Wall of Shame</h1>
        <p className="text-zinc-500">
          Your team&apos;s worst offenders, live.{" "}
          {!usingSupabase && <span className="text-amber-500">(local mode — only this browser)</span>}
        </p>
      </div>

      {entries === null ? (
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
      ) : entries.length === 0 ? (
        <p className="text-zinc-500">No one has been caught yet. Suspicious.</p>
      ) : (
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Offender</th>
                <th className="text-right px-4 py-3">📱 Phone</th>
                <th className="text-right px-4 py-3">🌐 Tabs</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">✅ Clean streak</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.name} className="border-t border-zinc-800/60">
                  <td className="px-4 py-3 text-zinc-500">
                    {i === 0 && e.totalViolations > 0 ? "👑" : i + 1}
                  </td>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-right">{e.phoneViolations}</td>
                  <td className="px-4 py-3 text-right">{e.tabViolations}</td>
                  <td
                    className={`px-4 py-3 text-right font-bold ${
                      e.totalViolations > 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {e.totalViolations}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400">{e.currentStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-700">Refreshes every 5 seconds. 👑 = team&apos;s biggest disappointment.</p>

      {myName && history.length > 0 && (
        <div className="w-full max-w-2xl space-y-3">
          <h2 className="text-xl font-bold">📜 Your sessions, {myName}</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-right px-4 py-2">Planned</th>
                  <th className="text-right px-4 py-2">Busted</th>
                  <th className="text-right px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-zinc-800/60">
                    <td className="px-4 py-2 text-zinc-400">
                      {new Date(h.started_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2 text-right">{h.planned_minutes} min</td>
                    <td className={`px-4 py-2 text-right ${h.violations > 0 ? "text-red-400 font-bold" : ""}`}>
                      {h.violations}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {h.completed && h.violations === 0
                        ? "✅ clean"
                        : h.completed
                          ? "⚠️ finished dirty"
                          : "💀 streak broken"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
