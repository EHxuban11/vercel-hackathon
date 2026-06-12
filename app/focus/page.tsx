"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneDetector, type Detection } from "@/lib/detector";
import { buildRoast } from "@/lib/roast";
import { sayRoast } from "@/lib/speech";
import {
  endSession,
  getSessionViolations,
  getStats,
  logViolation,
  startSession,
  usingSupabase,
  type ViolationEvent,
  type ViolationKind,
} from "@/lib/store";
import { randomPhrase, type Lang } from "@/lib/phrases";

const CONF_THRESHOLD = 0.3;
const WINDOW = 6; // look at the last N detections…
const HITS_TO_TRIGGER = 4; // …and fire when this many were above threshold
const COOLDOWN_MS = 8_000; // min gap between violations — roughly one roast's audio length
const DETECT_INTERVAL_MS = 120;

type Phase = "idle" | "loading" | "running" | "done";

export default function FocusPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<PhoneDetector | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastDetectRef = useRef(0);
  const hitsRef = useRef<boolean[]>([]);
  const lastViolationRef = useRef(0);
  const violationsRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const statsRef = useRef({ streak: 0, bestStreak: 0 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [score, setScore] = useState(0);
  const [fps, setFps] = useState(0);
  const [detectorInfo, setDetectorInfo] = useState("");
  const fpsTimesRef = useRef<number[]>([]);
  const [caught, setCaught] = useState(false);
  const [violations, setViolations] = useState(0);
  const [lastRoast, setLastRoast] = useState("");
  const [timeline, setTimeline] = useState<ViolationEvent[]>([]);
  const [completedClean, setCompletedClean] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [name, setName] = useState("");

  useEffect(() => {
    const n = localStorage.getItem("pj_name");
    if (!n) {
      router.replace("/");
      return;
    }
    setName(n);
    setLang((localStorage.getItem("pj_lang") as Lang) ?? "en");
  }, [router]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const violation = useCallback(
    (kind: ViolationKind) => {
      const now = Date.now();
      if (now - lastViolationRef.current < COOLDOWN_MS) return;
      lastViolationRef.current = now;
      violationsRef.current += 1;
      setViolations(violationsRef.current);
      setCaught(true);
      setTimeout(() => setCaught(false), 3500);

      // flash the tab title — visible even in a muted screen recording
      const originalTitle = document.title;
      let flashes = 0;
      const flashIv = setInterval(() => {
        document.title = document.title === originalTitle ? "📵 BUSTED" : originalTitle;
        if (++flashes >= 12) {
          clearInterval(flashIv);
          document.title = originalTitle;
        }
      }, 500);

      const userName = localStorage.getItem("pj_name") ?? "unknown";
      const currentLang = (localStorage.getItem("pj_lang") as Lang) ?? "en";
      const text = buildRoast({
        kind,
        name: userName,
        countThisSession: violationsRef.current,
        minutesIn: Math.round((now - startedAtRef.current) / 60_000),
        streak: statsRef.current.streak,
        bestStreak: statsRef.current.bestStreak,
        lang: currentLang,
      });
      setLastRoast(text);
      setTimeout(() => setLastRoast(""), 8000); // caption lingers while the voice speaks
      void sayRoast(text, currentLang, randomPhrase(kind, currentLang).id);
      if (sessionIdRef.current) void logViolation(sessionIdRef.current, userName, kind);
    },
    []
  );

  const drawOverlay = useCallback((det: Detection | null) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (det?.box) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 4;
      ctx.strokeRect(det.box.x, det.box.y, det.box.w, det.box.h);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 20px sans-serif";
      // the canvas is CSS-mirrored with the video — pre-flip the label so it reads normally
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.fillText(
        `PHONE ${(det.score * 100).toFixed(0)}%`,
        canvas.width - det.box.x - det.box.w,
        Math.max(det.box.y - 8, 20)
      );
      ctx.restore();
    }
  }, []);

  const loop = useCallback(
    (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (phaseRef.current !== "running") return;
      if (t - lastDetectRef.current < DETECT_INTERVAL_MS) return;
      lastDetectRef.current = t;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector?.ready) return;
      void detector.detect(video, CONF_THRESHOLD).then((det) => {
        if (!det || phaseRef.current !== "running") return;
        const now = performance.now();
        fpsTimesRef.current.push(now);
        while (fpsTimesRef.current.length && fpsTimesRef.current[0] < now - 2000) {
          fpsTimesRef.current.shift();
        }
        setFps(fpsTimesRef.current.length / 2);
        setScore(det.score);
        drawOverlay(det);
        // sliding window: tolerate flickery scores instead of demanding strict consecutive hits
        hitsRef.current.push(det.score >= CONF_THRESHOLD);
        if (hitsRef.current.length > WINDOW) hitsRef.current.shift();
        if (hitsRef.current.filter(Boolean).length >= HITS_TO_TRIGGER) {
          hitsRef.current = [];
          violation("phone");
        }
      });
    },
    [drawOverlay, violation]
  );

  const finish = useCallback(async (completed: boolean) => {
    if (phaseRef.current === "done") return; // idempotent — timer/strict-mode/bfcache can race
    setPhase("done");
    phaseRef.current = "done";
    setCompletedClean(completed && violationsRef.current === 0);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      await endSession(sessionId, completed);
      // extension/Mac app log to the same table — count those too
      const all = await getSessionViolations(sessionId).catch(() => []);
      setCompletedClean(completed && violationsRef.current === 0 && all.length === 0);
    }
  }, []);

  // countdown (pure updater; finishing handled by the effect below)
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && secondsLeft === 0) void finish(true);
  }, [phase, secondsLeft, finish]);

  // live timeline: poll this session's violations (includes the browser
  // extension and the Mac app — they write to the same Supabase table)
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => {
      if (sessionIdRef.current) {
        void getSessionViolations(sessionIdRef.current).then(setTimeline).catch(() => {});
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [phase]);

  // tab closed mid-session → end the session via beacon (otherwise the
  // extension and Mac app keep blocking a "zombie" session)
  useEffect(() => {
    function onPageHide() {
      if (phaseRef.current === "running" && sessionIdRef.current) {
        if (usingSupabase) {
          navigator.sendBeacon(
            "/api/end-session",
            new Blob([JSON.stringify({ sessionId: sessionIdRef.current })], { type: "application/json" })
          );
        } else {
          void endSession(sessionIdRef.current, false); // localStorage write is sync
        }
      }
    }
    function onPageShow(e: PageTransitionEvent) {
      // bfcache restore: the beacon already ended the session — don't resume a ghost
      if (e.persisted && phaseRef.current === "running") void finish(false);
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [finish]);

  // client-side nav away (header links) unmounts without pagehide — end the session
  useEffect(() => {
    return () => {
      if (phaseRef.current === "running" && sessionIdRef.current) {
        void endSession(sessionIdRef.current, false);
      }
    };
  }, []);

  // tab-switch detection (the "blocker" replacement)
  useEffect(() => {
    function onVisibility() {
      if (phaseRef.current !== "running") return;
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 1500) {
        hiddenAtRef.current = null;
        violation("tab");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [violation]);

  async function start() {
    setPhase("loading");
    try {
      setLoadingMsg("Requesting camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      if (!detectorRef.current) {
        const d = new PhoneDetector();
        await d.init(setLoadingMsg); // assign only on success so a failed init can retry
        detectorRef.current = d;
      }
      setDetectorInfo(detectorRef.current.info);

      const userName = localStorage.getItem("pj_name") ?? "unknown";
      statsRef.current = await getStats(userName).catch(() => ({ streak: 0, bestStreak: 0 }));
      sessionIdRef.current = await startSession(userName, plannedMinutes).catch(() => null);

      violationsRef.current = 0;
      hitsRef.current = [];
      lastViolationRef.current = 0;
      setViolations(0);
      setLastRoast("");
      setTimeline([]);
      setSecondsLeft(plannedMinutes * 60);
      startedAtRef.current = Date.now();
      setPhase("running");
      phaseRef.current = "running";
      lastDetectRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      setLoadingMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  function toggleLang() {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    localStorage.setItem("pj_lang", next);
  }

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 transition-colors duration-300 ${
        caught ? "bg-red-950" : ""
      }`}
    >
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-3xl font-bold">Ready, {name}?</h1>
          <div className="flex gap-3">
            {[15, 25, 50].map((m) => (
              <button
                key={m}
                onClick={() => setPlannedMinutes(m)}
                className={`px-5 py-3 rounded-lg border transition-colors ${
                  plannedMinutes === m
                    ? "bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold"
                    : "border-zinc-700 hover:border-zinc-400"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
          <button
            onClick={start}
            className="px-8 py-4 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-lg transition-colors"
          >
            Start focus session
          </button>
          <button onClick={toggleLang} className="text-sm text-zinc-500 hover:text-zinc-300">
            Voice language: {lang === "en" ? "🇬🇧 English" : "🇪🇸 Español"} (click to switch)
          </button>
          {loadingMsg.startsWith("Failed") && <p className="text-red-400 text-sm">{loadingMsg}</p>}
          <p className="text-xs text-zinc-600 max-w-sm">
            The camera feed is processed entirely in your browser with ONNX Runtime Web. No frames are
            uploaded anywhere — only violation events are recorded.
          </p>
          <p className="text-xs text-zinc-500 max-w-sm">
            💡 Mac glowing around the edges? That&apos;s macOS Edge Light, not us — click the green
            camera icon in the menu bar and toggle it off.
          </p>
        </div>
      )}

      {phase === "loading" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
          <p className="text-zinc-400">{loadingMsg}</p>
        </div>
      )}

      {(phase === "running" || phase === "loading") && (
        <div className={phase === "running" ? "contents" : "hidden"}>
          <div className="text-7xl font-mono font-bold tabular-nums">
            {mm}:{ss}
          </div>

          <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start">
            <div className="w-64 max-h-[360px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 order-2 lg:order-1">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Session timeline</h3>
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2 text-zinc-400">
                  <span className="text-zinc-600 font-mono text-xs pt-0.5">
                    {new Date(startedAtRef.current).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>▶️ Session started</span>
                </li>
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-2 text-red-300">
                    <span className="text-zinc-600 font-mono text-xs pt-0.5">
                      {new Date(e.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{e.kind === "phone" ? "📱 Grabbed the phone" : "🌐 Went for a distraction"}</span>
                  </li>
                ))}
                {timeline.length === 0 && (
                  <li className="text-zinc-600 text-xs italic">Clean so far. Suspicious.</li>
                )}
              </ol>
            </div>

            <div
              className={`relative rounded-xl overflow-hidden border-4 transition-colors order-1 lg:order-2 ${
                caught ? "border-red-500" : score >= CONF_THRESHOLD ? "border-amber-500" : "border-emerald-600"
              }`}
            >
              <video ref={videoRef} muted playsInline className="w-[480px] max-w-full -scale-x-100" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full -scale-x-100" />
              {caught && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/40">
                  <span className="text-3xl font-black tracking-wider drop-shadow">📵 BUSTED</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <span>
              Phone confidence:{" "}
              <span className={score >= CONF_THRESHOLD ? "text-red-400 font-bold" : "text-emerald-400"}>
                {(score * 100).toFixed(0)}%
              </span>
            </span>
            <span>
              Violations: <span className={violations > 0 ? "text-red-400 font-bold" : ""}>{violations}</span>
            </span>
            <span>Streak: {statsRef.current.streak}</span>
          </div>
          <div className="text-xs text-zinc-600 font-mono">
            {detectorInfo} · {fps.toFixed(1)} fps · 100% local inference
          </div>

          {lastRoast && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 max-w-2xl px-6 py-4 rounded-xl bg-black/85 border border-red-500/40 shadow-2xl">
              <p className="text-center text-2xl font-semibold text-yellow-300 leading-snug">
                🗣️ &ldquo;{lastRoast}&rdquo;
              </p>
            </div>
          )}

          <button
            onClick={() => finish(false)}
            className="text-sm text-zinc-500 hover:text-red-400 transition-colors"
          >
            Give up (coward)
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="text-4xl font-bold">
            {completedClean ? "🏆 Clean session!" : violations > 0 ? "😔 Session over" : "Session ended"}
          </h1>
          <p className="text-zinc-400 max-w-md">
            {completedClean
              ? "Not a single phone sighting. Your streak grows. Your parents would be proud — and for once, so am I."
              : violations > 0
                ? `${violations} violation${violations > 1 ? "s" : ""}. The Wall of Shame has been updated. Everyone knows.`
                : "You gave up early. The timer remembers."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setPhase("idle");
                setLoadingMsg("");
              }}
              className="px-6 py-3 rounded-lg bg-zinc-100 text-zinc-900 font-semibold hover:bg-white"
            >
              Go again
            </button>
            <button
              onClick={() => router.push("/shame")}
              className="px-6 py-3 rounded-lg border border-zinc-700 hover:border-zinc-400"
            >
              Wall of Shame
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
