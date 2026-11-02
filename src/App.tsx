// ──────────────────────────────────────────────────────────────
// App.tsx — PhysioEdge AI  •  Multi-view application shell
//
// • 100% client-side: no backend, no cloud, no video uploads.
// • Orchestrates 3 views: Workout Studio, Progress, Profile.
// • React state updates only on navigation, rep-complete events,
//   and localStorage sync — never at 30 FPS.
// ──────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import type { AppView, TelemetrySnapshot } from './types';
import { getSessions, getProfile, saveSession, generateId } from './storage';
import { EXERCISES } from './views/WorkoutStudio';
import { WorkoutStudio } from './views/WorkoutStudio';
import { ProgressDashboard } from './views/ProgressDashboard';
import { PatientProfile } from './views/PatientProfile';
import { PrivacyBadge } from './components/PrivacyBadge';
import { useTheme } from './hooks/useTheme';

// ── Nav items ──────────────────────────────────────────────────

const NAV: { view: AppView; icon: string; label: string }[] = [
  { view: 'workout',  icon: '🎯', label: 'Workout' },
  { view: 'progress', icon: '📊', label: 'Progress' },
  { view: 'profile',  icon: '👤', label: 'Profile' },
];

// ══════════════════════════════════════════════════════════════
// Root component
// ══════════════════════════════════════════════════════════════

export default function App() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const [view, setView]         = useState<AppView>('workout');
  const [profile, setProfile]   = useState(getProfile);
  const [sessions, setSessions] = useState(getSessions);

  // Called whenever localStorage changes so views stay in sync
  const refreshData = useCallback(() => {
    setProfile(getProfile());
    setSessions(getSessions());
  }, []);

  // Called by WorkoutStudio after user submits pain rating in modal
  const handleSessionSaved = useCallback(
    (pain: number, notes: string, snap: TelemetrySnapshot) => {
      const exercise = EXERCISES[snap.exerciseIdx]!;
      saveSession({
        id:               generateId(),
        date:             new Date().toISOString(),
        exerciseId:       exercise.id,
        exerciseName:     exercise.name,
        repsCompleted:    snap.reps,
        targetReps:       profile.targetRepsPerSet,
        durationSeconds:  snap.durationSeconds,
        bestRomAngle:     snap.peakRomAngle,
        painLevelAfter:   pain,
        notes,
      });
      setSessions(getSessions());
    },
    [profile.targetRepsPerSet],
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30
                         bg-white/95 dark:bg-gray-950/90
                         backdrop-blur
                         border-b border-slate-200 dark:border-gray-800/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-emerald-600 dark:text-emerald-400">Physio</span>
              <span className="text-slate-900 dark:text-white">Edge</span>
              <span className="text-slate-400 dark:text-gray-500 text-sm font-medium ml-1">AI</span>
            </span>
          </div>

          {/* Privacy badge */}
          <PrivacyBadge />
        </div>
      </header>

      {/* ── Tab navigation ────────────────────────────────────── */}
      <nav className="bg-white dark:bg-gray-950
                      border-b border-slate-200 dark:border-gray-800/50
                      sticky top-[57px] z-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1">
            {NAV.map(({ view: v, icon, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium
                            border-b-2 transition-colors ${
                  view === v
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300'
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-6">
        {view === 'workout' && (
          <WorkoutStudio
            targetReps={profile.targetRepsPerSet}
            onSessionSaved={handleSessionSaved}
          />
        )}

        {view === 'progress' && (
          <ProgressDashboard
            sessions={sessions}
            profile={profile}
            onDataChange={refreshData}
            isDark={isDark}
          />
        )}

        {view === 'profile' && (
          <PatientProfile
            profile={profile}
            sessions={sessions}
            onDataChange={refreshData}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="mt-auto py-4 text-center">
        <p className="text-slate-400 dark:text-gray-700 text-xs">
          PhysioEdge AI · All processing runs locally in your browser · No data leaves your device
        </p>
      </footer>
    </div>
  );
}
