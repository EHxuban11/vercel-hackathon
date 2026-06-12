const nameInput = document.getElementById("name");
const status = document.getElementById("status");

async function refresh() {
  const { userName } = await chrome.storage.sync.get("userName");
  const { blocking } = await chrome.storage.local.get("blocking");
  if (userName) nameInput.value = userName;
  status.innerHTML = userName
    ? blocking
      ? 'Focus session active — blocking is <span class="on">ON</span> 🔒'
      : "No active session — sites are free. Start one on the web app."
    : "Set your name to activate.";
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ userName: nameInput.value.trim() });
  status.textContent = "Saved. Syncing…";
  setTimeout(refresh, 1500);
});

refresh();
setInterval(refresh, 3000);
