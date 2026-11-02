// ──────────────────────────────────────────────────────────────
// components/SaveSessionModal.tsx — End-of-set pain modal
// ──────────────────────────────────────────────────────────────

import { useState } from 'react';
import type { TelemetrySnapshot } from '../types';

interface SaveSessionModalProps {
  snapshot: TelemetrySnapshot;
  exerciseName: string;
  targetReps: number;
  onSave: (painLevel: number, notes: string) => void;
  onDiscard: () => void;
}

export function SaveSessionModal({
  snapshot,
  exerciseName,
  targetReps,
  onSave,
  onDiscard,
}: SaveSessionModalProps) {
  const [pain, setPain] = useState(3);
  const [notes, setNotes] = useState('');

  const mins = Math.floor(snapshot.durationSeconds / 60).toString().padStart(2, '0');
  const secs = (snapshot.durationSeconds % 60).toString().padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-900
                      border border-slate-200 dark:border-gray-700
                      rounded-2xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl
                          bg-emerald-100 dark:bg-emerald-900/50
                          border border-emerald-200 dark:border-emerald-700/50
                          flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-lg">
            ✓
          </div>
          <div>
            <h2 className="text-slate-900 dark:text-white font-bold text-lg leading-tight">Session Complete!</h2>
            <p className="text-slate-500 dark:text-gray-400 text-sm">{exerciseName}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Reps Done', value: `${snapshot.reps} / ${targetReps}` },
            { label: 'Duration',  value: `${mins}:${secs}` },
            { label: 'Peak ROM',  value: snapshot.peakRomAngle > 0 ? `${snapshot.peakRomAngle.toFixed(0)}°` : 'N/A' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-100 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-slate-900 dark:text-white font-bold text-lg">{value}</div>
              <div className="text-slate-500 dark:text-gray-500 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Pain scale */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-3">
            Rate your lower back pain during this set
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPain(n)}
                className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                  pain === n
                    ? n <= 3
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                      : n <= 6
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : 'bg-red-600 text-white ring-2 ring-red-400'
                    : 'bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-300 dark:hover:bg-gray-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-slate-400 dark:text-gray-600 text-xs mt-2">
            1 = No Pain · 10 = Severe Pain
          </p>
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes (e.g., felt tightness on left side)…"
          rows={2}
          className="w-full bg-slate-100 dark:bg-gray-800
                     border border-slate-300 dark:border-gray-700
                     rounded-xl px-3 py-2.5
                     text-slate-800 dark:text-gray-200 text-sm
                     placeholder-slate-400 dark:placeholder-gray-600
                     focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none mb-5"
        />

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onSave(pain, notes)}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold
                       text-sm rounded-xl py-3 transition-colors"
          >
            Save to Browser History
          </button>
          <button
            onClick={onDiscard}
            className="px-4 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700
                       text-slate-600 dark:text-gray-400 font-medium text-sm rounded-xl py-3 transition-colors"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
