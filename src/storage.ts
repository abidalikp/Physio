// ──────────────────────────────────────────────────────────────
// storage.ts — 100% client-side localStorage manager
// ──────────────────────────────────────────────────────────────

import type { UserProfile, WorkoutSession } from './types';
import { DEFAULT_PROFILE } from './types';

const KEY_PROFILE = 'pt_user_profile';
const KEY_HISTORY = 'pt_workout_history';

// ── Generic safe helpers ──────────────────────────────────────

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[storage] Failed to write "${key}":`, err);
  }
}

// ── Profile ───────────────────────────────────────────────────

export function getProfile(): UserProfile {
  return { ...DEFAULT_PROFILE, ...safeRead<Partial<UserProfile>>(KEY_PROFILE, {}) };
}

export function saveProfile(profile: UserProfile): void {
  safeWrite(KEY_PROFILE, profile);
}

// ── Session history ───────────────────────────────────────────

export function getSessions(): WorkoutSession[] {
  return safeRead<WorkoutSession[]>(KEY_HISTORY, []);
}

export function saveSession(session: WorkoutSession): void {
  const sessions = getSessions();
  sessions.unshift(session); // most-recent first
  safeWrite(KEY_HISTORY, sessions);
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter((s) => s.id !== id);
  safeWrite(KEY_HISTORY, sessions);
}

export function clearAllData(): void {
  try {
    localStorage.removeItem(KEY_PROFILE);
    localStorage.removeItem(KEY_HISTORY);
  } catch (err) {
    console.error('[storage] Failed to clear data:', err);
  }
}

// ── Storage usage estimate ────────────────────────────────────

export function getStorageSizeKB(): number {
  try {
    let total = 0;
    for (const key of [KEY_PROFILE, KEY_HISTORY]) {
      const val = localStorage.getItem(key);
      if (val) total += val.length * 2; // UTF-16 bytes
    }
    return Math.round(total / 1024);
  } catch {
    return 0;
  }
}

// ── Unique ID ─────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Demo data seed ────────────────────────────────────────────

const EXERCISE_POOL = [
  { id: 'hip-hinge',     name: 'Standing Hip Hinge' },
  { id: 'glute-bridge',  name: 'Glute Bridge' },
  { id: 'wall-angels',   name: 'Wall Angels' },
  { id: 'cat-cow',       name: 'Cat-Cow' },
  { id: 'dead-bugs',     name: 'Dead Bugs' },
];

export function seedDemoData(): void {
  const now = Date.now();
  const DAY = 86_400_000;
  const sessions: WorkoutSession[] = [];

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    // 2–3 sessions per day
    const sessionsPerDay = dayOffset % 3 === 0 ? 2 : 3;
    for (let s = 0; s < sessionsPerDay; s++) {
      const ex = EXERCISE_POOL[(dayOffset * 3 + s) % EXERCISE_POOL.length]!;
      const reps = 8 + Math.floor(Math.random() * 3); // 8-10
      const pain = Math.max(1, 7 - dayOffset - Math.floor(Math.random() * 2)); // trending down
      const rom  = dayOffset < 3 ? 115 + Math.floor(Math.random() * 10) : 100 + Math.floor(Math.random() * 15);

      sessions.push({
        id: generateId(),
        date: new Date(now - dayOffset * DAY - s * 3_600_000).toISOString(),
        exerciseId:      ex.id,
        exerciseName:    ex.name,
        repsCompleted:   reps,
        targetReps:      10,
        durationSeconds: 45 + Math.floor(Math.random() * 60),
        bestRomAngle:    ex.id === 'cat-cow' || ex.id === 'dead-bugs' ? 0 : rom,
        painLevelAfter:  pain,
        notes:           '',
      });
    }
  }

  safeWrite(KEY_HISTORY, sessions);

  // Also seed a demo profile if none exists
  const existing = getProfile();
  if (!existing.name) {
    saveProfile({
      name: 'Demo Patient',
      age: 42,
      condition: 'Mechanical Lower Back Pain',
      rehabPhase: 'Phase 2: Strength & Stability',
      physioName: 'Dr. Sarah Ahmed',
      dailyGoalSets: 3,
      targetRepsPerSet: 10,
    });
  }
}
