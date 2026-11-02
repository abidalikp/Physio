// ──────────────────────────────────────────────────────────────
// types.ts — Shared type definitions for PhysioEdge AI
// ──────────────────────────────────────────────────────────────

/** A 2-D point (normalised 0-1 from MediaPipe). */
export interface Point {
  x: number;
  y: number;
}

/** Metadata for one supported exercise. */
export interface ExerciseConfig {
  id: string;
  name: string;
  description: string;
  cameraOrientation: string;  // e.g. "Side Profile — Face Right"
  targetJoint: string;        // e.g. "Hip angle"
  romThresholds: string;      // e.g. "Hinge below 120°, stand above 160°"
  profile: 'side' | 'front';
  /** Human-readable phase labels (for display only). */
  phases: readonly string[];
}

// ── Rehab Phase ───────────────────────────────────────────────

export type RehabPhase =
  | 'Phase 1: Pain Management'
  | 'Phase 2: Strength & Stability';

// ── Patient Profile ───────────────────────────────────────────

export interface UserProfile {
  name: string;
  age: number;
  condition: string;
  rehabPhase: RehabPhase;
  physioName: string;
  dailyGoalSets: number;
  targetRepsPerSet: number;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  age: 0,
  condition: 'Mechanical Lower Back Pain',
  rehabPhase: 'Phase 1: Pain Management',
  physioName: '',
  dailyGoalSets: 3,
  targetRepsPerSet: 10,
};

// ── Workout Session ───────────────────────────────────────────

export interface WorkoutSession {
  id: string;                 // UUID or timestamp string
  date: string;               // ISO timestamp
  exerciseId: string;         // matches ExerciseConfig.id
  exerciseName: string;       // display name
  repsCompleted: number;
  targetReps: number;
  durationSeconds: number;
  bestRomAngle: number;       // peak valid ROM angle; 0 for non-angle exercises
  painLevelAfter: number;     // 1–10
  notes: string;
}

// ── Application Views ─────────────────────────────────────────

export type AppView = 'workout' | 'progress' | 'profile';

// ── Live telemetry snapshot (synced from refs on events) ──────

export interface TelemetrySnapshot {
  reps: number;
  peakRomAngle: number;
  durationSeconds: number;
  exerciseIdx: number;
}
