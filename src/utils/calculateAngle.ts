// ──────────────────────────────────────────────────────────────
// calculateAngle.ts — Core biomechanical utility
// ──────────────────────────────────────────────────────────────

import type { Point } from '../types';

/**
 * Calculates the angle (in degrees) at the **vertex** point
 * formed by rays vertex→pointA and vertex→pointB.
 *
 * Uses `Math.atan2` for quadrant-aware arc-tangent.
 *
 * @returns Angle in the range [0, 180].
 */
export function calculateAngle(
  pointA: Point,
  vertex: Point,
  pointB: Point,
): number {
  const radians =
    Math.atan2(pointA.y - vertex.y, pointA.x - vertex.x) -
    Math.atan2(pointB.y - vertex.y, pointB.x - vertex.x);

  let angle = Math.abs(radians * (180 / Math.PI));

  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}
