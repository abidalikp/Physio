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
  profile: 'side' | 'front';
  /** Human-readable phase labels (for display only). */
  phases: readonly string[];
}
