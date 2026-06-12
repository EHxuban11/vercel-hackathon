// Shame page: shows a roast, logs a 'tab' violation to Supabase (the same
// table the web app uses) and plays a pre-generated shame mp3 from the app.

import { SUPABASE_URL, SUPABASE_KEY, APP_URL } from "./config.js";

const ROASTS = [
  "Switching tabs? Was YouTube calling your name again?",
  "Reddit will still be there in twenty minutes. Your deadline won't.",
  "I saw that. You left. In the middle of a focus session.",
  "Every tab you open is a little betrayal. I felt this one.",
  "Welcome back to reality. Your productivity left while you were gone.",
];
const AUDIO_IDS = ["tab-1", "tab-2", "tab-3", "tab-4", "tab-5"];

const COOLDOWN_MS = 15_000;

const idx = Math.floor(Math.random() * ROASTS.length);
document.getElementById("roast").textContent = `“${ROASTS[idx]}”`;

// audio may be blocked until user interaction; try anyway, it works when the
// redirect came from a user-initiated navigation
new Audio(`${APP_URL}/audio/${AUDIO_IDS[idx]}.mp3`).play().catch(() => {});

(async () => {
  const { userName } = await chrome.storage.sync.get("userName");
  const { activeSessionId, lastViolationAt } = await chrome.storage.local.get([
    "activeSessionId",
    "lastViolationAt",
  ]);
  if (!userName || !activeSessionId) return;
  if (lastViolationAt && Date.now() - lastViolationAt < COOLDOWN_MS) return;

  await chrome.storage.local.set({ lastViolationAt: Date.now() });
  await fetch(`${SUPABASE_URL}/rest/v1/violations`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: activeSessionId, user_name: userName, kind: "tab" }),
  }).catch(() => {});
})();
