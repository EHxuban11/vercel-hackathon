"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneDetector, type Detection } from "@/lib/detector";
import { buildRoast } from "@/lib/roast";
import { sayRoast } from "@/lib/speech";
import { endSession, getStats, logViolation, startSession, type ViolationKind } from "@/lib/store";
import { randomPhrase, type Lang } from "@/lib/phrases";

const CONF_THRESHOLD = 0.3;
const WINDOW = 6; // look at the last N detections…
const HITS_TO_TRIGGER = 4; // …and fire when this many were above threshold
const COOLDOWN_MS = 15_000; // min gap between violations
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
  const [caught, setCaught] = useState(false);
  const [violations, setViolations] = useState(0);
  const [lastRoast, setLastRoast] = useState("");
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
      void sayRoast(text, currentLang, randomPhrase(kind, currentLang).id);
      if (sessionIdRef.current) void logViolation(sessionIdRef.current, userName, kind);
    },
    []
  );

  const drawOverlay = useCallback((det: Detection | null) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) {
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
      ctx.fillText(`PHONE ${(det.score * 100).toFixed(0)}%`, det.box.x, Math.max(det.box.y - 8, 20));
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
    setPhase("done");
    phaseRef.current = "done";
    setCompletedClean(completed && violationsRef.current === 0);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (sessionIdRef.current) await endSession(sessionIdRef.current, completed);
  }, []);

  // countdown
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(iv);
          void finish(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, finish]);

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
        detectorRef.current = new PhoneDetector();
        await detectorRef.current.init(setLoadingMsg);
      }

      const userName = localStorage.getItem("pj_name") ?? "unknown";
      statsRef.current = await getStats(userName).catch(() => ({ streak: 0, bestStreak: 0 }));
      sessionIdRef.current = await startSession(userName, plannedMinutes).catch(() => null);

      violationsRef.current = 0;
      setViolations(0);
      setLastRoast("");
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

          <div
            className={`relative rounded-xl overflow-hidden border-4 transition-colors ${
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

          {lastRoast && (
            <p className="max-w-md text-center text-red-300 italic">&ldquo;{lastRoast}&rdquo;</p>
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
