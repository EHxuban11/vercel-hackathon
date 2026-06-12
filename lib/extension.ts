// Zero-config pairing with the Phone Jail Blocker extension. The extension
// ships a fixed key in its manifest, so its ID is stable across installs.

const EXTENSION_ID = "ljndcelecikgncfeegdmoemnkpcofapn";

type ChromeRuntime = {
  runtime?: {
    sendMessage: (
      id: string,
      msg: unknown,
      cb: (res?: { ok?: boolean; installed?: boolean }) => void
    ) => void;
    lastError?: unknown;
  };
};

function runtime() {
  return (globalThis as { chrome?: ChromeRuntime }).chrome?.runtime;
}

/** Push the user's name to the extension if it's installed. Fire-and-forget. */
export function pairExtension(userName: string) {
  const rt = runtime();
  if (!rt || !userName.trim()) return;
  try {
    rt.sendMessage(EXTENSION_ID, { type: "pair", userName }, () => {
      void rt.lastError; // swallow "no receiver" when extension isn't installed
    });
  } catch {
    // not Chromium or extension missing — fine
  }
}

/** Resolves true if the extension is installed and reachable. */
export function extensionInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const rt = runtime();
    if (!rt) return resolve(false);
    try {
      rt.sendMessage(EXTENSION_ID, { type: "ping" }, (res) => {
        void rt.lastError;
        resolve(!!res?.installed);
      });
      setTimeout(() => resolve(false), 1000);
    } catch {
      resolve(false);
    }
  });
}
