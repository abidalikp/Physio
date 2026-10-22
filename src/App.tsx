// ──────────────────────────────────────────────────────────────────────────────
// App.tsx — PhysioEdge AI  •  Zero-Cloud Edge AI Physical Therapy Application
// ──────────────────────────────────────────────────────────────────────────────
//
// • 100 % client-side: no backend, no cloud, no video uploads.
// • Pose inference via @mediapipe/tasks-vision PoseLandmarker (WASM + GPU).
// • requestAnimationFrame render loop with useRef-based counters
//   to avoid React re-render storms at 30 fps.
// ──────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { calculateAngle } from './utils/calculateAngle';
import type { ExerciseConfig } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

/** CDN path for the MediaPipe Vision WASM runtime. */
const VISION_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

/** CDN path for the PoseLandmarker model (lite, float16). */
const MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// ── Exercise catalogue ───────────────────────────────────────────────────────

const EXERCISES: ExerciseConfig[] = [
  {
    id: 'hip-hinge',
    name: 'Standing Hip Hinge',
    description:
      'Stand sideways to the camera. Keep your back straight and hinge forward at the hips, then return to standing.',
    profile: 'side',
    phases: ['UP', 'DOWN'],
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    description:
      'Lie on your back with knees bent, sideways to the camera. Push your hips toward the ceiling, then lower.',
    profile: 'side',
    phases: ['DOWN', 'UP'],
  },
  {
    id: 'wall-angels',
    name: 'Wall Angels',
    description:
      'Stand facing the camera with your back against a wall. Slide your arms up overhead, then bend elbows down.',
    profile: 'front',
    phases: ['DOWN', 'UP'],
  },
  {
    id: 'cat-cow',
    name: 'Cat-Cow',
    description:
      'On all fours, sideways to the camera. Alternate between arching your back (Cat) and dipping your belly (Cow).',
    profile: 'side',
    phases: ['CAT', 'COW'],
  },
  {
    id: 'dead-bugs',
    name: 'Dead Bugs',
    description:
      'Lie on your back, sideways to the camera. Extend opposite arm and leg outward, then bring them back.',
    profile: 'side',
    phases: ['CONTRACTED', 'EXTENDED'],
  },
];

// ── MediaPipe pose skeleton connections (index pairs) ────────────────────────

const POSE_CONNECTIONS: [number, number][] = [
  // Face / head
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right arm
  [12, 14], [14, 16],
  // Left arm
  [11, 13], [13, 15],
  // Right leg
  [24, 26], [26, 28],
  // Left leg
  [23, 25], [25, 27],
  // Hands
  [16, 18], [16, 20], [16, 22],
  [15, 17], [15, 19], [15, 21],
  // Feet
  [28, 30], [28, 32],
  [27, 29], [27, 31],
];

/** Landmark indices that matter for each exercise (highlighted in the HUD). */
const EXERCISE_LANDMARKS: number[][] = [
  [12, 24, 26],       // Hip Hinge:   Shoulder, Hip, Knee
  [12, 24, 26],       // Glute Bridge: same
  [12, 14, 16],       // Wall Angels: Shoulder, Elbow, Wrist
  [12, 24],           // Cat-Cow:     Shoulder, Hip
  [24, 26, 16],       // Dead Bugs:   Hip, Knee, Wrist
];

// ── Helper: visibility gate ──────────────────────────────────────────────────

function visible(lm: NormalizedLandmark | undefined, threshold = 0.5): boolean {
  return !!lm && (lm.visibility ?? 0) > threshold;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ── UI state (infrequent updates — safe to use useState) ─────────────────
  const [cameraActive, setCameraActive] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // ── High-frequency state (useRef — NO useState!) ─────────────────────────
  const repsRef = useRef(0);
  const phaseRef = useRef('IDLE');
  const feedbackRef = useRef('Select an exercise and start the camera');
  const angleRef = useRef(0);

  // Mirror of selectedExercise readable inside RAF without stale closures
  const selectedExerciseRef = useRef(0);

  // ── Hardware / animation refs ────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafIdRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  // ══════════════════════════════════════════════════════════════════════════
  // 1.  MediaPipe initialisation
  // ══════════════════════════════════════════════════════════════════════════

  const initModel = useCallback(async () => {
    if (poseLandmarkerRef.current) return;
    setLoading(true);
    setInitError(null);

    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: MODEL_CDN,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        },
      );
      setModelReady(true);
    } catch (err) {
      console.error('Failed to initialise PoseLandmarker:', err);
      setInitError(
        'Failed to load the AI model. Check your network connection and console.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load model on mount
  useEffect(() => {
    void initModel();
  }, [initModel]);

  // ══════════════════════════════════════════════════════════════════════════
  // 2.  Canvas drawing utilities
  // ══════════════════════════════════════════════════════════════════════════

  /** Draw the full skeleton + highlight active landmarks. */
  const drawSkeleton = useCallback(
    (ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[]) => {
      const w = VIDEO_WIDTH;
      const h = VIDEO_HEIGHT;
      const active = new Set(EXERCISE_LANDMARKS[selectedExerciseRef.current]);

      // ── Connections ──
      ctx.lineWidth = 3;
      for (const [i, j] of POSE_CONNECTIONS) {
        const a = landmarks[i];
        const b = landmarks[j];
        if (!visible(a) || !visible(b)) continue;

        const isActive = active.has(i) && active.has(j);
        ctx.strokeStyle = isActive ? '#00FF88' : 'rgba(0,255,136,0.3)';
        ctx.beginPath();
        ctx.moveTo(a!.x * w, a!.y * h);
        ctx.lineTo(b!.x * w, b!.y * h);
        ctx.stroke();
      }

      // ── Landmark dots ──
      landmarks.forEach((lm, idx) => {
        if (!visible(lm)) return;
        const isActive = active.has(idx);
        const radius = isActive ? 7 : 4;

        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#00FFAA' : '#FF5555';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.stroke();
      });

      // ── Angle arc visualisation (for angle-based exercises 0-2) ──
      const exIdx = selectedExerciseRef.current;
      if (exIdx <= 2 && angleRef.current > 0) {
        const ids = EXERCISE_LANDMARKS[exIdx]!;
        const pA = landmarks[ids[0]!];
        const vtx = landmarks[ids[1]!];
        const pB = landmarks[ids[2]!];
        if (pA && vtx && pB && visible(pA) && visible(vtx) && visible(pB)) {
          const vx = vtx.x * w;
          const vy = vtx.y * h;
          const startAngle = Math.atan2(pA.y * h - vy, pA.x * w - vx);
          const endAngle = Math.atan2(pB.y * h - vy, pB.x * w - vx);
          ctx.beginPath();
          ctx.arc(vx, vy, 30, startAngle, endAngle, false);
          ctx.strokeStyle = 'rgba(255,220,68,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    },
    [],
  );

  /** Draw the on-canvas Heads-Up Display. */
  const drawHUD = useCallback((ctx: CanvasRenderingContext2D) => {
    const exercise = EXERCISES[selectedExerciseRef.current]!;
    const w = VIDEO_WIDTH;
    const h = VIDEO_HEIGHT;

    // ── Top bar ──
    const grad = ctx.createLinearGradient(0, 0, 0, 68);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 68);

    // Exercise name
    ctx.fillStyle = '#00FF88';
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(exercise.name, 16, 12);

    // Phase badge
    const phase = phaseRef.current;
    const phaseColor =
      phase === 'IDLE'
        ? '#888888'
        : phase === 'UP' || phase === 'EXTENDED' || phase === 'CAT'
          ? '#FFDD44'
          : '#00BBFF';
    ctx.fillStyle = phaseColor;
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText(`▸ ${phase}`, 16, 38);

    // Reps (right-aligned)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Inter, system-ui, sans-serif';
    ctx.fillText(`${repsRef.current}`, w - 16, 8);
    ctx.fillStyle = '#999999';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText('REPS', w - 16, 44);

    // ── Angle pill (bottom-left) ──
    const exIdx = selectedExerciseRef.current;
    if (angleRef.current > 0 && exIdx <= 2) {
      const pillW = 100;
      const pillH = 32;
      const pillX = 12;
      const pillY = h - 56;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, pillX, pillY, pillW, pillH, 8);
      ctx.fill();
      ctx.fillStyle = '#00DDFF';
      ctx.font = 'bold 18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${angleRef.current.toFixed(1)}°`, pillX + 12, pillY + pillH / 2);
    }

    // ── Feedback bar (bottom) ──
    if (feedbackRef.current) {
      const barH = 36;
      const barY = h - barH;
      const gradBot = ctx.createLinearGradient(0, barY - 10, 0, h);
      gradBot.addColorStop(0, 'rgba(0,0,0,0)');
      gradBot.addColorStop(0.3, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gradBot;
      ctx.fillRect(0, barY - 10, w, barH + 10);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '500 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(feedbackRef.current, w / 2, barY + barH / 2);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // 3.  Exercise biomechanical state machines
  // ══════════════════════════════════════════════════════════════════════════

  const processExercise = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      const idx = selectedExerciseRef.current;

      switch (idx) {
        // ── 0: Standing Hip Hinge ──────────────────────────────────────────
        case 0: {
          const shoulder = landmarks[12];
          const hip = landmarks[24];
          const knee = landmarks[26];
          if (!visible(shoulder) || !visible(hip) || !visible(knee)) {
            feedbackRef.current =
              'Stand sideways so your right shoulder, hip & knee are visible';
            return;
          }

          const angle = calculateAngle(shoulder!, hip!, knee!);
          angleRef.current = angle;
          const prev = phaseRef.current;

          if (angle > 160) {
            phaseRef.current = 'UP';
            feedbackRef.current = 'Standing tall — now hinge forward at the hips';
          } else if (angle < 120) {
            phaseRef.current = 'DOWN';
            feedbackRef.current = 'Good hinge! Return to standing';
          } else {
            feedbackRef.current =
              angle > 140 ? 'Hinge deeper…' : 'Almost there — stand up straight';
          }

          // Rep: DOWN → UP
          if (prev === 'DOWN' && phaseRef.current === 'UP') repsRef.current++;
          break;
        }

        // ── 1: Glute Bridge ────────────────────────────────────────────────
        case 1: {
          const shoulder = landmarks[12];
          const hip = landmarks[24];
          const knee = landmarks[26];
          if (!visible(shoulder) || !visible(hip) || !visible(knee)) {
            feedbackRef.current =
              'Lie on your back — position the camera to see your right side';
            return;
          }

          const angle = calculateAngle(shoulder!, hip!, knee!);
          angleRef.current = angle;
          const prev = phaseRef.current;

          if (angle > 160) {
            phaseRef.current = 'UP';
            feedbackRef.current = 'Hips high! Hold, then lower slowly';
          } else if (angle < 130) {
            phaseRef.current = 'DOWN';
            feedbackRef.current = 'Resting — push hips up toward the ceiling';
          } else {
            feedbackRef.current = 'Keep pushing up…';
          }

          // Rep: UP → DOWN
          if (prev === 'UP' && phaseRef.current === 'DOWN') repsRef.current++;
          break;
        }

        // ── 2: Wall Angels ─────────────────────────────────────────────────
        case 2: {
          const shoulder = landmarks[12];
          const elbow = landmarks[14];
          const wrist = landmarks[16];
          if (!visible(shoulder) || !visible(elbow) || !visible(wrist)) {
            feedbackRef.current =
              'Face the camera — make sure your right arm is visible';
            return;
          }

          const angle = calculateAngle(shoulder!, elbow!, wrist!);
          angleRef.current = angle;
          const prev = phaseRef.current;

          if (angle > 150) {
            phaseRef.current = 'UP';
            feedbackRef.current = 'Arms extended! Now slowly bend elbows down';
          } else if (angle < 100) {
            phaseRef.current = 'DOWN';
            feedbackRef.current = 'Elbows bent — slide arms up the wall';
          } else {
            feedbackRef.current = 'Keep moving…';
          }

          // Rep: UP → DOWN
          if (prev === 'UP' && phaseRef.current === 'DOWN') repsRef.current++;
          break;
        }

        // ── 3: Cat-Cow ─────────────────────────────────────────────────────
        // No lumbar keypoint — track vertical Y distance shoulder↔hip.
        case 3: {
          const shoulder = landmarks[12];
          const hip = landmarks[24];
          if (!visible(shoulder) || !visible(hip)) {
            feedbackRef.current =
              'Get on all fours — camera on your right side';
            return;
          }

          // Normalised Y distance (0 = no vertical gap, ~0.3 = very large gap)
          const yDist = Math.abs(hip!.y - shoulder!.y);
          angleRef.current = 0; // No angle for this exercise
          const prev = phaseRef.current;

          // Thresholds calibrated for a person on all fours seen from the side.
          // COW (belly dips): torso flattens → yDist shrinks.
          // CAT (back arches): torso compresses → yDist grows.
          if (yDist < 0.10) {
            phaseRef.current = 'COW';
            feedbackRef.current = 'Cow — belly dropping. Now arch your back up';
          } else if (yDist > 0.18) {
            phaseRef.current = 'CAT';
            feedbackRef.current = 'Cat — back arched! Now let your belly drop';
          } else {
            feedbackRef.current = 'Transition between Cat and Cow…';
          }

          // Rep: CAT → COW
          if (prev === 'CAT' && phaseRef.current === 'COW') repsRef.current++;
          break;
        }

        // ── 4: Dead Bugs ───────────────────────────────────────────────────
        case 4: {
          const hip = landmarks[24];
          const knee = landmarks[26];
          const wrist = landmarks[16];
          if (!visible(hip) || !visible(knee) || !visible(wrist)) {
            feedbackRef.current =
              'Lie on your back — position camera to see your right side';
            return;
          }

          // Euclidean distance between knee and wrist (normalised coords)
          const dist = Math.hypot(
            knee!.x - wrist!.x,
            knee!.y - wrist!.y,
          );
          angleRef.current = 0;
          const prev = phaseRef.current;

          if (dist < 0.15) {
            phaseRef.current = 'CONTRACTED';
            feedbackRef.current =
              'Contracted — now extend opposite arm & leg outward';
          } else if (dist > 0.35) {
            phaseRef.current = 'EXTENDED';
            feedbackRef.current =
              'Fully extended! Bring limbs back to centre';
          } else {
            feedbackRef.current = 'Keep moving…';
          }

          // Rep: EXTENDED → CONTRACTED
          if (prev === 'EXTENDED' && phaseRef.current === 'CONTRACTED')
            repsRef.current++;
          break;
        }
      }
    },
    [],
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 4.  requestAnimationFrame render loop
  // ══════════════════════════════════════════════════════════════════════════

  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    if (!video || !canvas || !poseLandmarker || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

    // Only process genuinely new video frames
    const now = video.currentTime;
    if (now !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = now;

      const results = poseLandmarker.detectForVideo(video, performance.now());

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0]!;
        drawSkeleton(ctx, lm);
        processExercise(lm);
      } else {
        feedbackRef.current = 'No pose detected — adjust your position';
      }
    }

    drawHUD(ctx);

    rafIdRef.current = requestAnimationFrame(renderLoop);
  }, [drawSkeleton, drawHUD, processExercise]);

  // ══════════════════════════════════════════════════════════════════════════
  // 5.  Camera start / stop
  // ══════════════════════════════════════════════════════════════════════════

  const startCamera = useCallback(async () => {
    // Ensure model is loaded
    if (!poseLandmarkerRef.current) {
      await initModel();
      if (!poseLandmarkerRef.current) return; // still failed
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: VIDEO_WIDTH },
          height: { ideal: VIDEO_HEIGHT },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Reset tracking state
      repsRef.current = 0;
      phaseRef.current = 'IDLE';
      feedbackRef.current = 'Camera started — get into position';
      angleRef.current = 0;
      lastVideoTimeRef.current = -1;

      setCameraActive(true);

      // Kick off the render loop
      rafIdRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error('Camera error:', err);
      feedbackRef.current = 'Camera access denied. Check browser permissions.';
    }
  }, [initModel, renderLoop]);

  const stopCamera = useCallback(() => {
    // 1. Cancel animation frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }

    // 2. Explicitly stop every track to release the camera (battery!)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // 3. Detach stream from <video>
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 4. Clear the overlay canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    }

    setCameraActive(false);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // 6.  Exercise selector handler
  // ══════════════════════════════════════════════════════════════════════════

  const handleExerciseChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      setSelectedExercise(idx);
      selectedExerciseRef.current = idx;

      // Reset counters when switching exercises
      repsRef.current = 0;
      phaseRef.current = 'IDLE';
      angleRef.current = 0;
      feedbackRef.current = `Ready for ${EXERCISES[idx]!.name}`;
    },
    [],
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 7.  Render
  // ══════════════════════════════════════════════════════════════════════════

  const currentExercise = EXERCISES[selectedExercise]!;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="w-full max-w-[680px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            <span className="text-brand-400">Physio</span>
            <span className="text-white">Edge</span>
            <span className="text-gray-500 ml-1.5 text-lg font-medium">AI</span>
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Back Pain Rehabilitation · 100% On-Device
          </p>
        </div>

        {/* Exercise dropdown */}
        <select
          value={selectedExercise}
          onChange={handleExerciseChange}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg
                     px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                     outline-none cursor-pointer min-w-[220px]"
        >
          {EXERCISES.map((ex, i) => (
            <option key={ex.id} value={i}>
              {ex.name}
            </option>
          ))}
        </select>
      </header>

      {/* ── Video container ─────────────────────────────────────────────── */}
      <div className="video-container bg-gray-900">
        <video
          ref={videoRef}
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          autoPlay
          playsInline
          muted
          className="bg-black"
        />
        <canvas
          ref={canvasRef}
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          className="pointer-events-none"
        />

        {/* Idle / loading overlay */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-10">
            {loading ? (
              <>
                <div className="loading-pulse text-brand-400 mb-3">
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.25-11.396c.251.023.501.05.75.082M19 14.5l-2.47-2.47"
                    />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Loading AI model…</p>
              </>
            ) : initError ? (
              <>
                <p className="text-red-400 text-sm text-center max-w-xs">
                  {initError}
                </p>
                <button
                  onClick={() => void initModel()}
                  className="mt-3 text-sm text-brand-400 hover:text-brand-300 underline"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="text-gray-600 mb-3">
                  <svg
                    className="w-16 h-16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z"
                    />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">
                  Camera is off · Press{' '}
                  <span className="text-gray-300 font-medium">Start Camera</span>{' '}
                  to begin
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={() => void startCamera()}
          disabled={cameraActive || loading}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700
                     disabled:text-gray-500 text-white font-semibold text-sm rounded-lg
                     px-6 py-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.12V15.88a1.5 1.5 0 002.3 1.279l9.344-5.88a1.5 1.5 0 000-2.558L6.3 2.84z" />
          </svg>
          Start Camera
        </button>

        <button
          onClick={stopCamera}
          disabled={!cameraActive}
          className="flex items-center gap-2 bg-red-600/80 hover:bg-red-500 disabled:bg-gray-700
                     disabled:text-gray-500 text-white font-semibold text-sm rounded-lg
                     px-6 py-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm5-2.25A.75.75 0 017.75 7h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5z"
              clipRule="evenodd"
            />
          </svg>
          Stop Camera
        </button>
      </div>

      {/* ── Exercise info card ──────────────────────────────────────────── */}
      <div className="mt-6 w-full max-w-[680px] bg-gray-900/60 border border-gray-800 rounded-xl px-6 py-4">
        <div className="flex items-start gap-3">
          <span
            className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
              currentExercise.profile === 'side'
                ? 'bg-blue-900/50 text-blue-400'
                : 'bg-purple-900/50 text-purple-400'
            }`}
          >
            {currentExercise.profile} profile
          </span>
          <div>
            <h2 className="text-white font-semibold text-lg leading-tight">
              {currentExercise.name}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {currentExercise.description}
            </p>
            <p className="text-gray-600 text-xs mt-2">
              Phases:{' '}
              {currentExercise.phases.map((p, i) => (
                <span key={p}>
                  <code className="text-gray-400">{p}</code>
                  {i < currentExercise.phases.length - 1 ? ' → ' : ''}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-auto pt-8 pb-4 text-center">
        <p className="text-gray-700 text-xs">
          PhysioEdge AI · All processing runs locally on your device · No data
          leaves your browser
        </p>
      </footer>
    </div>
  );
}

// ── Canvas helper: rounded rectangle ─────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
