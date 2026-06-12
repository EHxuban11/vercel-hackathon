// Data layer: Supabase when configured, localStorage otherwise.
// Everything is keyed by display name (hackathon-grade identity).

import { supabase } from "./supabase";

export type ViolationKind = "phone" | "tab";

export type SessionRow = {
  id: string;
  user_name: string;
  started_at: string;
  ended_at: string | null;
  planned_minutes: number;
  completed: boolean;
  violation_count: number;
};

export type LeaderboardEntry = {
  name: string;
  totalViolations: number;
  phoneViolations: number;
  tabViolations: number;
  sessionsCompleted: number;
  currentStreak: number;
};

const LS_SESSIONS = "pj_sessions";
const LS_VIOLATIONS = "pj_violations";

type LocalViolation = { session_id: string; user_name: string; kind: ViolationKind; created_at: string };

function lsRead<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function lsWrite<T>(key: string, rows: T[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}

export const usingSupabase = supabase !== null;

export async function startSession(userName: string, plannedMinutes: number): Promise<string> {
  if (supabase) {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ user_name: userName, planned_minutes: plannedMinutes })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  const id = crypto.randomUUID();
  const rows = lsRead<SessionRow>(LS_SESSIONS);
  rows.push({
    id,
    user_name: userName,
    started_at: new Date().toISOString(),
    ended_at: null,
    planned_minutes: plannedMinutes,
    completed: false,
    violation_count: 0,
  });
  lsWrite(LS_SESSIONS, rows);
  return id;
}

export async function endSession(sessionId: string, completed: boolean) {
  if (supabase) {
    await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString(), completed })
      .eq("id", sessionId)
      .is("ended_at", null); // never overwrite an already-ended session (beacon/finish race)
    return;
  }
  const rows = lsRead<SessionRow>(LS_SESSIONS);
  const row = rows.find((r) => r.id === sessionId);
  if (row) {
    row.ended_at = new Date().toISOString();
    row.completed = completed;
    lsWrite(LS_SESSIONS, rows);
  }
}

export async function logViolation(sessionId: string, userName: string, kind: ViolationKind) {
  if (supabase) {
    await supabase.from("violations").insert({ session_id: sessionId, user_name: userName, kind });
    return;
  }
  const rows = lsRead<LocalViolation>(LS_VIOLATIONS);
  rows.push({ session_id: sessionId, user_name: userName, kind, created_at: new Date().toISOString() });
  lsWrite(LS_VIOLATIONS, rows);
  const sessions = lsRead<SessionRow>(LS_SESSIONS);
  const s = sessions.find((r) => r.id === sessionId);
  if (s) {
    s.violation_count += 1;
    lsWrite(LS_SESSIONS, sessions);
  }
}

/** Current streak = consecutive most-recent completed sessions with zero violations. */
export async function getStats(userName: string): Promise<{ streak: number; bestStreak: number }> {
  let sessions: { id: string; completed: boolean; started_at: string; ended_at: string | null }[] = [];
  let rawViolations: { session_id: string; created_at: string }[] = [];

  if (supabase) {
    const [s, v] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, completed, started_at, ended_at")
        .eq("user_name", userName)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase.from("violations").select("session_id, created_at").eq("user_name", userName),
    ]);
    sessions = s.data ?? [];
    rawViolations = (v.data ?? []) as typeof rawViolations;
  } else {
    sessions = lsRead<SessionRow>(LS_SESSIONS)
      .filter((r) => r.user_name === userName && r.ended_at !== null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    rawViolations = lsRead<LocalViolation>(LS_VIOLATIONS);
  }

  // ignore stragglers logged by the extension/Mac app after the session ended
  const endedAt = new Map(sessions.map((s) => [s.id, s.ended_at]));
  const violationsBySession = new Map<string, number>();
  for (const v of rawViolations) {
    const end = endedAt.get(v.session_id);
    if (end && v.created_at > end) continue;
    violationsBySession.set(v.session_id, (violationsBySession.get(v.session_id) ?? 0) + 1);
  }

  const clean = sessions.map((s) => s.completed && !(violationsBySession.get(s.id) ?? 0));
  let streak = 0;
  for (const ok of clean) {
    if (!ok) break;
    streak++;
  }
  let bestStreak = 0;
  let run = 0;
  for (const ok of clean) {
    run = ok ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  return { streak, bestStreak };
}

export type ViolationEvent = { id: string; kind: ViolationKind; created_at: string };

/** All violations of one session, oldest first — feeds the live timeline. */
export async function getSessionViolations(sessionId: string): Promise<ViolationEvent[]> {
  if (supabase) {
    const { data } = await supabase
      .from("violations")
      .select("id, kind, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(100);
    return (data ?? []).map((r) => ({ ...r, id: String(r.id) }));
  }
  return lsRead<LocalViolation>(LS_VIOLATIONS)
    .filter((v) => v.session_id === sessionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((v, i) => ({ id: `${sessionId}-${i}`, kind: v.kind, created_at: v.created_at }));
}

export type RecentViolation = { id: string; user_name: string; kind: ViolationKind; created_at: string };

/** Latest violations across everyone — feeds the Wall of Shame live ticker. */
export async function getRecentViolations(limit = 10): Promise<RecentViolation[]> {
  if (supabase) {
    const { data } = await supabase
      .from("violations")
      .select("id, user_name, kind, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r) => ({ ...r, id: String(r.id) }));
  }
  return lsRead<LocalViolation>(LS_VIOLATIONS)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((v, i) => ({ id: `local-${i}`, user_name: v.user_name, kind: v.kind, created_at: v.created_at }));
}

/** Names of users with a focus session running right now (zombie-filtered). */
export async function getActiveUsers(): Promise<Set<string>> {
  let rows: { user_name: string; started_at: string; planned_minutes: number }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("sessions")
      .select("user_name, started_at, planned_minutes")
      .is("ended_at", null)
      .limit(50);
    rows = data ?? [];
  } else {
    rows = lsRead<SessionRow>(LS_SESSIONS).filter((r) => r.ended_at === null);
  }
  const now = Date.now();
  return new Set(
    rows
      .filter((r) => now - new Date(r.started_at).getTime() < (r.planned_minutes + 10) * 60_000)
      .map((r) => r.user_name)
  );
}

/** Grand total of violations ever logged — the landing-page shame counter. */
export async function getTotalViolations(): Promise<number> {
  if (supabase) {
    const { count } = await supabase.from("violations").select("*", { count: "exact", head: true });
    return count ?? 0;
  }
  return lsRead<LocalViolation>(LS_VIOLATIONS).length;
}

export type HistoryEntry = {
  id: string;
  started_at: string;
  planned_minutes: number;
  completed: boolean;
  violations: number;
};

/** Your past sessions, newest first — including how many times you got busted in each. */
export async function getHistory(userName: string): Promise<HistoryEntry[]> {
  let sessions: SessionRow[] = [];
  const counts = new Map<string, number>();

  if (supabase) {
    const [s, v] = await Promise.all([
      supabase
        .from("sessions")
        .select("*")
        .eq("user_name", userName)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(30),
      supabase.from("violations").select("session_id").eq("user_name", userName),
    ]);
    sessions = (s.data ?? []) as SessionRow[];
    for (const row of v.data ?? []) {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    }
  } else {
    sessions = lsRead<SessionRow>(LS_SESSIONS)
      .filter((r) => r.user_name === userName && r.ended_at !== null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 30);
    for (const v of lsRead<LocalViolation>(LS_VIOLATIONS)) {
      counts.set(v.session_id, (counts.get(v.session_id) ?? 0) + 1);
    }
  }

  return sessions.map((s) => ({
    id: s.id,
    started_at: s.started_at,
    planned_minutes: s.planned_minutes,
    completed: s.completed,
    violations: counts.get(s.id) ?? 0,
  }));
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  let sessions: SessionRow[] = [];
  let violations: { session_id: string; user_name: string; kind: ViolationKind; created_at: string }[] = [];

  if (supabase) {
    const [s, v] = await Promise.all([
      supabase.from("sessions").select("*").order("started_at", { ascending: false }).limit(500),
      supabase.from("violations").select("session_id, user_name, kind, created_at").limit(2000),
    ]);
    sessions = (s.data ?? []) as SessionRow[];
    violations = (v.data ?? []) as typeof violations;
  } else {
    sessions = lsRead<SessionRow>(LS_SESSIONS);
    violations = lsRead<LocalViolation>(LS_VIOLATIONS) as typeof violations;
  }

  // drop violations logged after their session ended (extension/Mac app stragglers)
  const sessionEnd = new Map(sessions.map((s) => [s.id, s.ended_at]));
  violations = violations.filter((v) => {
    const end = sessionEnd.get(v.session_id);
    return !end || v.created_at <= end;
  });

  const byName = new Map<string, LeaderboardEntry>();
  const ensure = (name: string) => {
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        totalViolations: 0,
        phoneViolations: 0,
        tabViolations: 0,
        sessionsCompleted: 0,
        currentStreak: 0,
      });
    }
    return byName.get(name)!;
  };

  const violationsBySession = new Map<string, number>();
  for (const v of violations) {
    const e = ensure(v.user_name);
    e.totalViolations++;
    if (v.kind === "phone") e.phoneViolations++;
    else e.tabViolations++;
    violationsBySession.set(v.session_id, (violationsBySession.get(v.session_id) ?? 0) + 1);
  }

  const sessionsByName = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    ensure(s.user_name);
    if (s.completed) ensure(s.user_name).sessionsCompleted++;
    const arr = sessionsByName.get(s.user_name) ?? [];
    arr.push(s);
    sessionsByName.set(s.user_name, arr);
  }
  for (const [name, rows] of sessionsByName) {
    const sorted = rows
      .filter((r) => r.ended_at !== null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    let streak = 0;
    for (const s of sorted) {
      if (s.completed && !(violationsBySession.get(s.id) ?? 0)) streak++;
      else break;
    }
    ensure(name).currentStreak = streak;
  }

  // Wall of Shame: worst offenders first
  return [...byName.values()].sort((a, b) => b.totalViolations - a.totalViolations);
}
