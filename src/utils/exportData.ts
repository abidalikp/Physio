// ──────────────────────────────────────────────────────────────
// utils/exportData.ts — CSV/JSON download + clipboard report
// ──────────────────────────────────────────────────────────────

import type { WorkoutSession, UserProfile } from '../types';

/** Trigger a file download in the browser. */
function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export session history as JSON. */
export function exportJSON(sessions: WorkoutSession[]): void {
  const ts = new Date().toISOString().slice(0, 10);
  downloadFile(
    JSON.stringify(sessions, null, 2),
    `physioedge-sessions-${ts}.json`,
    'application/json',
  );
}

/** Export session history as CSV. */
export function exportCSV(sessions: WorkoutSession[]): void {
  const header = [
    'Date', 'Exercise', 'Reps Completed', 'Target Reps',
    'Duration (s)', 'Best ROM Angle (°)', 'Pain Score', 'Notes',
  ].join(',');

  const rows = sessions.map((s) =>
    [
      `"${new Date(s.date).toLocaleString()}"`,
      `"${s.exerciseName}"`,
      s.repsCompleted,
      s.targetReps,
      s.durationSeconds,
      s.bestRomAngle,
      s.painLevelAfter,
      `"${s.notes.replace(/"/g, '""')}"`,
    ].join(','),
  );

  const ts = new Date().toISOString().slice(0, 10);
  downloadFile(
    [header, ...rows].join('\n'),
    `physioedge-sessions-${ts}.csv`,
    'text/csv',
  );
}

/** Build the WhatsApp-ready clinician summary string. */
export function buildClinicianReport(
  profile: UserProfile,
  sessions: WorkoutSession[],
): string {
  const last7 = sessions.filter((s) => {
    const age = Date.now() - new Date(s.date).getTime();
    return age <= 7 * 86_400_000;
  });

  const totalReps  = last7.reduce((acc, s) => acc + s.repsCompleted, 0);
  const romSamples = last7.filter((s) => s.bestRomAngle > 0).map((s) => s.bestRomAngle);
  const avgRom     = romSamples.length
    ? Math.round(romSamples.reduce((a, b) => a + b, 0) / romSamples.length)
    : 0;
  const latestPain = last7[0]?.painLevelAfter ?? 0;

  return (
    `📊 PT Adherence Summary — ${profile.name || 'Patient'} | ` +
    `Phase: ${profile.rehabPhase} | ` +
    `Last 7 Days: ${last7.length} sessions completed (${totalReps} total reps) | ` +
    `Avg Peak ROM: ${avgRom > 0 ? `${avgRom}°` : 'N/A'} | ` +
    `Latest Pain Score: ${latestPain}/10. ` +
    `Verified via Zero-Cloud Edge AI.`
  );
}
