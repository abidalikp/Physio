// ──────────────────────────────────────────────────────────────
// views/WorkoutStudio.tsx — View 1: Live AI Pose Tracker
//
// CRITICAL: All high-frequency state (angles, phase, reps, fps)
// lives in useRef. React state only updates on rep-complete,
// pause, or "Finish Set" — never at 30 FPS.
// ──────────────────────────────────────────────────────────────

import {
  useRef, useState, useCallback, useEffect,
} from 'react';
import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { calculateAngle } from '../utils/calculateAngle';
import type { ExerciseConfig, TelemetrySnapshot } from '../types';
import { useVoiceCoach } from '../hooks/useVoiceCoach';
import { SaveSessionModal } from '../components/SaveSessionModal';

// ── Constants ──────────────────────────────────────────────────

const VIDEO_WIDTH  = 640;
const VIDEO_HEIGHT = 480;

const VISION_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// ── Exercise catalogue ─────────────────────────────────────────

export const EXERCISES: ExerciseConfig[] = [
  {
    id: 'hip-hinge',
    name: 'Standing Hip Hinge',
    description:
      'Stand sideways to the camera. Keep your back straight and hinge forward at the hips, then return to standing.',
    cameraOrientation: 'Side Profile — Face Right',
    targetJoint: 'Hip angle (Shoulder → Hip → Knee)',
    romThresholds: 'Hinge below 120°, return above 160°',
    profile: 'side',
    phases: ['UP', 'DOWN'],
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    description:
      'Lie on your back with knees bent, sideways to the camera. Push your hips toward the ceiling, then lower.',
    cameraOrientation: 'Side Profile — Face Right',
    targetJoint: 'Hip angle (Shoulder → Hip → Knee)',
    romThresholds: 'Hips down below 130°, fully raised above 160°',
    profile: 'side',
    phases: ['DOWN', 'UP'],
  },
  {
    id: 'wall-angels',
    name: 'Wall Angels',
    description:
      'Stand facing the camera with your back against a wall. Slide your arms up overhead, then bend elbows down.',
    cameraOrientation: 'Front Profile — Face Camera',
    targetJoint: 'Elbow angle (Shoulder → Elbow → Wrist)',
    romThresholds: 'Elbows bent below 100°, extended above 150°',
    profile: 'front',
    phases: ['DOWN', 'UP'],
  },
  {
    id: 'cat-cow',
    name: 'Cat-Cow',
    description:
      'On all fours, sideways to the camera. Alternate between arching your back (Cat) and dipping your belly (Cow).',
    cameraOrientation: 'Side Profile — Face Right',
    targetJoint: 'Shoulder-to-Hip vertical distance',
    romThresholds: 'COW: torso flat, CAT: back arched high',
    profile: 'side',
    phases: ['CAT', 'COW'],
  },
  {
    id: 'dead-bugs',
    name: 'Dead Bugs',
    description:
      'Lie on your back, sideways to the camera. Extend opposite arm and leg outward, then bring them back.',
    cameraOrientation: 'Side Profile — Face Right',
    targetJoint: 'Knee-to-Wrist distance',
    romThresholds: 'Contracted < 0.15, Extended > 0.35 (normalised)',
    profile: 'side',
    phases: ['CONTRACTED', 'EXTENDED'],
  },
];

// ── Skeleton connections ───────────────────────────────────────

const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [12, 14], [14, 16],
  [11, 13], [13, 15],
  [24, 26], [26, 28],
  [23, 25], [25, 27],
  [16, 18], [16, 20], [16, 22],
  [15, 17], [15, 19], [15, 21],
  [28, 30], [28, 32],
  [27, 29], [27, 31],
];

const EXERCISE_LANDMARKS: number[][] = [
  [12, 24, 26], // Hip Hinge
  [12, 24, 26], // Glute Bridge
  [12, 14, 16], // Wall Angels
  [12, 24],     // Cat-Cow
  [24, 26, 16], // Dead Bugs
];

const VISIBILITY_CHECK_LANDMARKS: number[][] = [
  [12, 24, 26],
  [12, 24, 26],
  [11, 12, 14],
  [12, 24],
  [24, 26, 16],
];

// ── Helpers ────────────────────────────────────────────────────

function visible(lm: NormalizedLandmark | undefined, threshold = 0.5): boolean {
  return !!lm && (lm.visibility ?? 0) > threshold;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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

// ── Props ──────────────────────────────────────────────────────

interface WorkoutStudioProps {
  targetReps: number;
  onSessionSaved: (pain: number, notes: string, snap: TelemetrySnapshot) => void;
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export function WorkoutStudio({ targetReps, onSessionSaved }: WorkoutStudioProps) {
  // ── UI state ─────────────────────────────────────────────────
  const [cameraActive, setCameraActive]           = useState(false);
  const [selectedExercise, setSelectedExercise]   = useState(0);
  const [loading, setLoading]                     = useState(false);
  const [modelReady, setModelReady]               = useState(false);
  const [initError, setInitError]                 = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled]           = useState(true);
  const [showModal, setShowModal]                 = useState(false);
  const [telemetryDisplay, setTelemetryDisplay]   = useState({ reps: 0, fps: 0, elapsed: '00:00', peakRom: 0 });
  const [briefingShown, setBriefingShown]         = useState(true);

  // ── High-frequency refs (NEVER trigger React re-render) ──────
  const repsRef           = useRef(0);
  const phaseRef          = useRef('IDLE');
  const feedbackRef       = useRef('Select an exercise and start the camera');
  const angleRef          = useRef(0);
  const peakRomRef        = useRef(0);
  const lowVisibilityRef  = useRef(false);
  const sessionStartRef   = useRef<number>(0);
  const fpsCountRef       = useRef(0);
  const fpsTimestampRef   = useRef(0);
  const displayedFpsRef   = useRef(0);
  const selectedExerciseRef = useRef(0);
  const telemetryThrottleRef = useRef(0);

  // ── Hardware refs ────────────────────────────────────────────
  const videoRef          = useRef<HTMLVideoElement>(null);
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafIdRef          = useRef(0);
  const lastVideoTimeRef  = useRef(-1);
  const snapshotRef       = useRef<TelemetrySnapshot | null>(null);

  // ── Voice coach ──────────────────────────────────────────────
  const { speak, cancel } = useVoiceCoach({ enabled: voiceEnabled });

  // ══════════════════════════════════════════════════════════════
  // 1. MediaPipe init (PRESERVED)
  // ══════════════════════════════════════════════════════════════

  const initModel = useCallback(async () => {
    if (poseLandmarkerRef.current) return;
    setLoading(true);
    setInitError(null);
    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_CDN, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      setModelReady(true);
    } catch (err) {
      console.error('PoseLandmarker init failed:', err);
      setInitError('Failed to load AI model. Check network and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void initModel(); }, [initModel]);

  // ══════════════════════════════════════════════════════════════
  // 2. Canvas drawing (PRESERVED — HUD always dark over video)
  // ══════════════════════════════════════════════════════════════

  const drawSkeleton = useCallback((ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[]) => {
    const w = VIDEO_WIDTH;
    const h = VIDEO_HEIGHT;
    const active = new Set(EXERCISE_LANDMARKS[selectedExerciseRef.current]);

    ctx.lineWidth = 3;
    for (const [i, j] of POSE_CONNECTIONS) {
      const a = landmarks[i];
      const b = landmarks[j];
      if (!visible(a) || !visible(b)) continue;
      const isActive = active.has(i) && active.has(j);
      ctx.strokeStyle = isActive ? '#00FF88' : 'rgba(0,255,136,0.25)';
      ctx.beginPath();
      ctx.moveTo(a!.x * w, a!.y * h);
      ctx.lineTo(b!.x * w, b!.y * h);
      ctx.stroke();
    }

    landmarks.forEach((lm, idx) => {
      if (!visible(lm)) return;
      const isActive = active.has(idx);
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, isActive ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#00FFAA' : '#FF5555';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();
    });

    const exIdx = selectedExerciseRef.current;
    if (exIdx <= 2 && angleRef.current > 0) {
      const ids = EXERCISE_LANDMARKS[exIdx]!;
      const pA  = landmarks[ids[0]!];
      const vtx = landmarks[ids[1]!];
      const pB  = landmarks[ids[2]!];
      if (pA && vtx && pB && visible(pA) && visible(vtx) && visible(pB)) {
        const vx = vtx.x * w;
        const vy = vtx.y * h;
        ctx.beginPath();
        ctx.arc(vx, vy, 30,
          Math.atan2(pA.y * h - vy, pA.x * w - vx),
          Math.atan2(pB.y * h - vy, pB.x * w - vx),
          false,
        );
        ctx.strokeStyle = 'rgba(255,220,68,0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, []);

  const drawHUD = useCallback((ctx: CanvasRenderingContext2D) => {
    const exercise = EXERCISES[selectedExerciseRef.current]!;
    const w = VIDEO_WIDTH;
    const h = VIDEO_HEIGHT;

    const grad = ctx.createLinearGradient(0, 0, 0, 72);
    grad.addColorStop(0, 'rgba(0,0,0,0.88)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 72);

    ctx.fillStyle = '#00FF88';
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(exercise.name, 16, 12);

    const phase = phaseRef.current;
    const phaseColor =
      phase === 'IDLE' ? '#888888'
      : (phase === 'UP' || phase === 'EXTENDED' || phase === 'CAT') ? '#FFDD44'
      : '#00BBFF';
    ctx.fillStyle = phaseColor;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(`▸ ${phase}`, 16, 38);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillText(`${displayedFpsRef.current} fps`, 16, 56);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Inter, system-ui, sans-serif';
    ctx.fillText(`${repsRef.current}`, w - 16, 6);
    ctx.fillStyle = '#888888';
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillText(`/ ${targetReps} REPS`, w - 16, 46);

    const exIdx = selectedExerciseRef.current;
    if (angleRef.current > 0 && exIdx <= 2) {
      const pillW = 110;
      const pillH = 32;
      const pillX = 12;
      const pillY = h - 60;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, pillX, pillY, pillW, pillH, 8);
      ctx.fill();
      ctx.fillStyle = '#00DDFF';
      ctx.font = 'bold 18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${angleRef.current.toFixed(1)}°`, pillX + 12, pillY + pillH / 2);
    }

    if (lowVisibilityRef.current) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.fillRect(0, h - 86, w, 30);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️  Step back: Keep shoulder, hip & knee clearly in frame', w / 2, h - 71);
    }

    const barH = 36;
    const barY = h - barH;
    const gradBot = ctx.createLinearGradient(0, barY - 10, 0, h);
    gradBot.addColorStop(0, 'rgba(0,0,0,0)');
    gradBot.addColorStop(0.3, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = gradBot;
    ctx.fillRect(0, barY - 10, w, barH + 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(feedbackRef.current, w / 2, barY + barH / 2);
  }, [targetReps]);

  // ══════════════════════════════════════════════════════════════
  // 3. Exercise state machines (PRESERVED)
  // ══════════════════════════════════════════════════════════════

  const processExercise = useCallback((landmarks: NormalizedLandmark[]) => {
    const idx = selectedExerciseRef.current;

    const checkLandmarks = VISIBILITY_CHECK_LANDMARKS[idx] ?? [];
    lowVisibilityRef.current = checkLandmarks.some((li) => !visible(landmarks[li]));

    switch (idx) {
      case 0: {
        const shoulder = landmarks[12];
        const hip      = landmarks[24];
        const knee     = landmarks[26];
        if (!visible(shoulder) || !visible(hip) || !visible(knee)) {
          feedbackRef.current = 'Stand sideways so your right shoulder, hip & knee are visible';
          return;
        }
        const angle = calculateAngle(shoulder!, hip!, knee!);
        angleRef.current = angle;
        if (angle > peakRomRef.current) peakRomRef.current = angle;
        const prev = phaseRef.current;
        if (angle > 160) {
          phaseRef.current = 'UP';
          feedbackRef.current = 'Standing tall — now hinge forward at the hips';
        } else if (angle < 120) {
          phaseRef.current = 'DOWN';
          feedbackRef.current = 'Good hinge! Return to standing';
        } else {
          feedbackRef.current = angle > 140 ? 'Hinge deeper…' : 'Almost there — stand up straight';
        }
        if (prev === 'DOWN' && phaseRef.current === 'UP') {
          repsRef.current++;
          speak(String(repsRef.current));
          speak('Good depth, stand up');
        }
        break;
      }
      case 1: {
        const shoulder = landmarks[12];
        const hip      = landmarks[24];
        const knee     = landmarks[26];
        if (!visible(shoulder) || !visible(hip) || !visible(knee)) {
          feedbackRef.current = 'Lie on your back — position the camera to see your right side';
          return;
        }
        const angle = calculateAngle(shoulder!, hip!, knee!);
        angleRef.current = angle;
        if (angle > peakRomRef.current) peakRomRef.current = angle;
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
        if (prev === 'UP' && phaseRef.current === 'DOWN') {
          repsRef.current++;
          speak(String(repsRef.current));
        }
        break;
      }
      case 2: {
        const shoulder = landmarks[12];
        const elbow    = landmarks[14];
        const wrist    = landmarks[16];
        if (!visible(shoulder) || !visible(elbow) || !visible(wrist)) {
          feedbackRef.current = 'Face the camera — make sure your right arm is visible';
          return;
        }
        const angle = calculateAngle(shoulder!, elbow!, wrist!);
        angleRef.current = angle;
        if (angle > peakRomRef.current) peakRomRef.current = angle;
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
        if (prev === 'UP' && phaseRef.current === 'DOWN') {
          repsRef.current++;
          speak(String(repsRef.current));
        }
        break;
      }
      case 3: {
        const shoulder = landmarks[12];
        const hip      = landmarks[24];
        if (!visible(shoulder) || !visible(hip)) {
          feedbackRef.current = 'Get on all fours — camera on your right side';
          return;
        }
        const yDist = Math.abs(hip!.y - shoulder!.y);
        angleRef.current = 0;
        const prev = phaseRef.current;
        if (yDist < 0.10) {
          phaseRef.current = 'COW';
          feedbackRef.current = 'Cow — belly dropping. Now arch your back up';
        } else if (yDist > 0.18) {
          phaseRef.current = 'CAT';
          feedbackRef.current = 'Cat — back arched! Now let your belly drop';
        } else {
          feedbackRef.current = 'Transition between Cat and Cow…';
        }
        if (prev === 'CAT' && phaseRef.current === 'COW') {
          repsRef.current++;
          speak(String(repsRef.current));
        }
        break;
      }
      case 4: {
        const hip   = landmarks[24];
        const knee  = landmarks[26];
        const wrist = landmarks[16];
        if (!visible(hip) || !visible(knee) || !visible(wrist)) {
          feedbackRef.current = 'Lie on your back — position camera to see your right side';
          return;
        }
        const dist = Math.hypot(knee!.x - wrist!.x, knee!.y - wrist!.y);
        angleRef.current = 0;
        const prev = phaseRef.current;
        if (dist < 0.15) {
          phaseRef.current = 'CONTRACTED';
          feedbackRef.current = 'Contracted — now extend opposite arm & leg outward';
        } else if (dist > 0.35) {
          phaseRef.current = 'EXTENDED';
          feedbackRef.current = 'Fully extended! Bring limbs back to centre';
        } else {
          feedbackRef.current = 'Keep moving…';
        }
        if (prev === 'EXTENDED' && phaseRef.current === 'CONTRACTED') {
          repsRef.current++;
          speak(String(repsRef.current));
        }
        break;
      }
    }
  }, [speak]);

  // ══════════════════════════════════════════════════════════════
  // 4. requestAnimationFrame render loop (PRESERVED)
  // ══════════════════════════════════════════════════════════════

  const renderLoop = useCallback(() => {
    const video          = videoRef.current;
    const canvas         = canvasRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    if (!video || !canvas || !poseLandmarker || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

    const now = video.currentTime;
    if (now !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = now;

      fpsCountRef.current++;
      const elapsed = performance.now() - fpsTimestampRef.current;
      if (elapsed >= 1000) {
        displayedFpsRef.current = Math.round(fpsCountRef.current * 1000 / elapsed);
        fpsCountRef.current = 0;
        fpsTimestampRef.current = performance.now();
      }

      const results = poseLandmarker.detectForVideo(video, performance.now());
      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0]!;
        drawSkeleton(ctx, lm);
        processExercise(lm);
      } else {
        feedbackRef.current = 'No pose detected — adjust your position';
        lowVisibilityRef.current = false;
      }
    }

    drawHUD(ctx);

    // Throttled React telemetry sync — max once per second
    const nowMs = performance.now();
    if (nowMs - telemetryThrottleRef.current > 1000) {
      telemetryThrottleRef.current = nowMs;
      const elapsedSec = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const secs = (elapsedSec % 60).toString().padStart(2, '0');
      setTelemetryDisplay({
        reps:    repsRef.current,
        fps:     displayedFpsRef.current,
        elapsed: `${mins}:${secs}`,
        peakRom: peakRomRef.current,
      });
    }

    rafIdRef.current = requestAnimationFrame(renderLoop);
  }, [drawSkeleton, drawHUD, processExercise]);

  // ══════════════════════════════════════════════════════════════
  // 5. Camera start / stop (PRESERVED)
  // ══════════════════════════════════════════════════════════════

  const startCamera = useCallback(async () => {
    if (!poseLandmarkerRef.current) {
      await initModel();
      if (!poseLandmarkerRef.current) return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      repsRef.current          = 0;
      phaseRef.current         = 'IDLE';
      feedbackRef.current      = 'Camera started — get into position';
      angleRef.current         = 0;
      peakRomRef.current       = 0;
      lastVideoTimeRef.current = -1;
      lowVisibilityRef.current = false;
      sessionStartRef.current  = Date.now();
      fpsCountRef.current      = 0;
      fpsTimestampRef.current  = performance.now();

      setBriefingShown(false);
      setCameraActive(true);
      rafIdRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error('Camera error:', err);
      feedbackRef.current = 'Camera access denied. Check browser permissions.';
    }
  }, [initModel, renderLoop]);

  const stopCamera = useCallback(() => {
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current)  { videoRef.current.srcObject = null; }
    if (canvasRef.current) { canvasRef.current.getContext('2d')?.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); }
    cancel();
    setCameraActive(false);
  }, [cancel]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => { if (document.hidden && cameraActive) stopCamera(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [cameraActive, stopCamera]);

  // ══════════════════════════════════════════════════════════════
  // 6. Finish set
  // ══════════════════════════════════════════════════════════════

  const handleFinishSet = useCallback(() => {
    const durationSeconds = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    snapshotRef.current = {
      reps:           repsRef.current,
      peakRomAngle:   peakRomRef.current,
      durationSeconds,
      exerciseIdx:    selectedExerciseRef.current,
    };
    stopCamera();
    setShowModal(true);
  }, [stopCamera]);

  const handleSaveSession = useCallback((pain: number, notes: string) => {
    if (snapshotRef.current) onSessionSaved(pain, notes, snapshotRef.current);
    setShowModal(false);
    setBriefingShown(true);
    snapshotRef.current = null;
    repsRef.current = 0;
    peakRomRef.current = 0;
  }, [onSessionSaved]);

  const handleDiscardSession = useCallback(() => {
    setShowModal(false);
    setBriefingShown(true);
    snapshotRef.current = null;
    repsRef.current = 0;
    peakRomRef.current = 0;
  }, []);

  // ══════════════════════════════════════════════════════════════
  // 7. Exercise change
  // ══════════════════════════════════════════════════════════════

  const handleExerciseChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    setSelectedExercise(idx);
    selectedExerciseRef.current = idx;
    repsRef.current    = 0;
    phaseRef.current   = 'IDLE';
    angleRef.current   = 0;
    peakRomRef.current = 0;
    feedbackRef.current = `Ready for ${EXERCISES[idx]!.name}`;
    if (!cameraActive) setBriefingShown(true);
  }, [cameraActive]);

  // ══════════════════════════════════════════════════════════════
  // 8. Render
  // ══════════════════════════════════════════════════════════════

  const currentExercise = EXERCISES[selectedExercise]!;

  return (
    <div className="flex flex-col items-center gap-5 pb-8">
      {/* Exercise selector row */}
      <div className="w-full max-w-[680px] flex flex-wrap items-center gap-3">
        <select
          value={selectedExercise}
          onChange={handleExerciseChange}
          className="bg-white dark:bg-gray-800
                     border border-slate-300 dark:border-gray-700
                     text-slate-800 dark:text-gray-200
                     text-sm rounded-xl px-4 py-2.5
                     focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600
                     outline-none cursor-pointer flex-1 min-w-[200px]"
        >
          {EXERCISES.map((ex, i) => (
            <option key={ex.id} value={i}>{ex.name}</option>
          ))}
        </select>

        {/* Voice coach toggle */}
        <button
          onClick={() => setVoiceEnabled((v) => !v)}
          className={`flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl
                      border transition-colors ${
            voiceEnabled
              ? 'bg-indigo-50 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300'
              : 'bg-slate-100 dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-500 dark:text-gray-500'
          }`}
        >
          <span>{voiceEnabled ? '🔊' : '🔇'}</span>
          <span>Voice Coach</span>
        </button>
      </div>

      {/* Exercise briefing card */}
      {briefingShown && !cameraActive && (
        <div className="w-full max-w-[680px]
                        bg-white dark:bg-slate-900/80
                        border border-slate-200 dark:border-slate-700/60
                        rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg ${
              currentExercise.profile === 'side'
                ? 'bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700/50 text-blue-600 dark:text-blue-400'
                : 'bg-violet-100 dark:bg-violet-900/50 border border-violet-200 dark:border-violet-700/50 text-violet-600 dark:text-violet-400'
            }`}>
              {currentExercise.profile === 'side' ? '↔' : '⇅'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-slate-900 dark:text-white font-semibold text-base">{currentExercise.name}</h3>
              <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">{currentExercise.description}</p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { icon: '📷', label: 'Camera', value: currentExercise.cameraOrientation },
                  { icon: '🦴', label: 'Target Joint', value: currentExercise.targetJoint },
                  { icon: '📐', label: 'ROM Thresholds', value: currentExercise.romThresholds },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-2.5">
                    <div className="text-slate-400 dark:text-gray-500 text-xs mb-0.5">{icon} {label}</div>
                    <div className="text-slate-700 dark:text-gray-200 text-xs font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video container — idle overlay intentionally stays dark (camera viewport) */}
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

        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-10">
            {loading ? (
              <>
                <div className="loading-pulse text-emerald-400 mb-3">
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.25-11.396c.251.023.501.05.75.082M19 14.5l-2.47-2.47" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Loading AI model…</p>
              </>
            ) : initError ? (
              <>
                <p className="text-red-400 text-sm text-center max-w-xs">{initError}</p>
                <button onClick={() => void initModel()} className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline">
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="text-gray-600 mb-3">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">
                  {modelReady ? 'AI ready · Press ' : 'Initialising model…'}
                  {modelReady && <span className="text-gray-300 font-medium">Start Camera</span>}
                  {modelReady && ' to begin'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Live telemetry bar */}
      {cameraActive && (
        <div className="w-full max-w-[680px] grid grid-cols-4 gap-3">
          {[
            { label: 'FPS',      value: String(telemetryDisplay.fps) },
            { label: 'Elapsed',  value: telemetryDisplay.elapsed },
            { label: 'Progress', value: `${telemetryDisplay.reps} / ${targetReps}` },
            { label: 'Peak ROM', value: telemetryDisplay.peakRom > 0 ? `${telemetryDisplay.peakRom.toFixed(0)}°` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900/60
                                        border border-slate-200 dark:border-gray-800
                                        rounded-xl px-3 py-2.5 text-center">
              <div className="text-slate-900 dark:text-white font-bold text-lg leading-tight">{value}</div>
              <div className="text-slate-500 dark:text-gray-500 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {!cameraActive ? (
          <button
            onClick={() => void startCamera()}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600
                       disabled:bg-slate-200 dark:disabled:bg-gray-700
                       disabled:text-slate-400 dark:disabled:text-gray-500
                       text-white font-semibold text-sm rounded-xl px-7 py-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.12V15.88a1.5 1.5 0 002.3 1.279l9.344-5.88a1.5 1.5 0 000-2.558L6.3 2.84z" />
            </svg>
            Start Camera
          </button>
        ) : (
          <>
            <button
              onClick={handleFinishSet}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600
                         text-white font-semibold text-sm rounded-xl px-5 py-3 transition-colors"
            >
              ✓ Finish &amp; Save Set
            </button>
            <button
              onClick={stopCamera}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500
                         text-white font-semibold text-sm rounded-xl px-5 py-3 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm5-2.25A.75.75 0 017.75 7h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5z"
                  clipRule="evenodd" />
              </svg>
              Stop Camera
            </button>
          </>
        )}
      </div>

      {/* Save session modal */}
      {showModal && snapshotRef.current && (
        <SaveSessionModal
          snapshot={snapshotRef.current}
          exerciseName={EXERCISES[snapshotRef.current.exerciseIdx]?.name ?? ''}
          targetReps={targetReps}
          onSave={handleSaveSession}
          onDiscard={handleDiscardSession}
        />
      )}
    </div>
  );
}
