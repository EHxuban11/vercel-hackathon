// Service worker: polls Supabase for an active focus session and toggles
// blocking rules. The web app (phone-jail.vercel.app) is the source of truth.

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const BLOCKED_SITES = [
  "youtube.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "twitch.tv",
  "netflix.com",
  "facebook.com",
];

const POLL_MINUTES = 0.25; // 15s — alarms clamp to ~30s in practice, still fine

async function getActiveSession(userName) {
  const params = new URLSearchParams({
    user_name: `eq.${userName}`,
    ended_at: "is.null",
    select: "id,started_at,planned_minutes",
    order: "started_at.desc",
    limit: "1",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const s = rows[0];
  if (!s) return null;
  // Safety valve: if the tab was closed without ending the session, stop
  // blocking once planned time + 10 min grace is over.
  const ageMin = (Date.now() - new Date(s.started_at).getTime()) / 60000;
  if (ageMin > s.planned_minutes + 10) return null;
  return s;
}

function buildRules() {
  return BLOCKED_SITES.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/blocked.html" },
    },
    condition: {
      urlFilter: `||${site}`,
      resourceTypes: ["main_frame"],
    },
  }));
}

async function sync() {
  const { userName } = await chrome.storage.sync.get("userName");
  let active = null;
  if (userName) {
    try {
      active = await getActiveSession(userName);
    } catch {
      active = null; // network error → fail open, don't lock people out
    }
  }

  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = current.map((r) => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: active ? buildRules() : [],
  });

  await chrome.storage.local.set({
    activeSessionId: active?.id ?? null,
    blocking: !!active,
    lastSync: Date.now(),
  });
  chrome.action.setBadgeText({ text: active ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("sync", { periodInMinutes: POLL_MINUTES });
  sync();
});
chrome.runtime.onStartup.addListener(sync);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "sync") sync();
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.userName) sync();
});

// The web app pushes the user's name here on page load — zero-config pairing.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pair" && typeof msg.userName === "string" && msg.userName.trim()) {
    chrome.storage.sync.set({ userName: msg.userName.trim() }).then(() => {
      sync();
      sendResponse({ ok: true });
    });
    return true; // async response
  }
  if (msg?.type === "ping") {
    sendResponse({ ok: true, installed: true });
  }
});
