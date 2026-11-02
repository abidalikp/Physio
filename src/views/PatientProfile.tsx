// ──────────────────────────────────────────────────────────────
// views/PatientProfile.tsx — View 3: Profile & Clinician Export
// ──────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import type { UserProfile, WorkoutSession, RehabPhase } from '../types';
import type { Theme } from '../hooks/useTheme';
import { saveProfile, clearAllData, seedDemoData, getStorageSizeKB } from '../storage';
import { exportJSON, exportCSV, buildClinicianReport } from '../utils/exportData';

interface PatientProfileProps {
  profile: UserProfile;
  sessions: WorkoutSession[];
  onDataChange: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

const REHAB_PHASES: RehabPhase[] = [
  'Phase 1: Pain Management',
  'Phase 2: Strength & Stability',
];

export function PatientProfile({ profile, sessions, onDataChange, theme, onThemeChange }: PatientProfileProps) {
  const [form, setForm]             = useState<UserProfile>({ ...profile });
  const [saved, setSaved]           = useState(false);
  const [copied, setCopied]         = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [storageKB, setStorageKB]   = useState(getStorageSizeKB);

  const updateField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSaveProfile = useCallback(() => {
    saveProfile(form);
    setSaved(true);
    onDataChange();
    setTimeout(() => setSaved(false), 2500);
  }, [form, onDataChange]);

  const handleCopyReport = useCallback(async () => {
    const text = buildClinicianReport(form, sessions);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [form, sessions]);

  const handleClear = useCallback(() => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearAllData();
    setStorageKB(0);
    setConfirmClear(false);
    onDataChange();
  }, [confirmClear, onDataChange]);

  const handleSeedDemo = useCallback(() => {
    seedDemoData();
    setStorageKB(getStorageSizeKB());
    onDataChange();
  }, [onDataChange]);

  const clinicianReport = buildClinicianReport(form, sessions);

  return (
    <div className="flex flex-col gap-6 pb-8">

      {/* ── Appearance / Theme ─────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900/60
                      border border-slate-200 dark:border-gray-800
                      rounded-2xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold text-base mb-5 flex items-center gap-2">
          <span>🎨</span> Appearance
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-slate-700 dark:text-gray-200 font-medium text-sm">Interface Theme</div>
            <div className="text-slate-500 dark:text-gray-500 text-xs mt-0.5">
              Choose between a light clinical interface or the dark studio mode.
            </div>
          </div>

          {/* Toggle buttons */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onThemeChange('light')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                          border transition-all ${
                theme === 'light'
                  ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-sm ring-2 ring-amber-300/50'
                  : 'bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="text-base">☀️</span>
              <span>Light</span>
              {theme === 'light' && <span className="text-xs opacity-70 font-normal">(active)</span>}
            </button>

            <button
              onClick={() => onThemeChange('dark')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                          border transition-all ${
                theme === 'dark'
                  ? 'bg-indigo-950 border-indigo-600 text-indigo-300 shadow-sm ring-2 ring-indigo-500/40'
                  : 'bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="text-base">🌙</span>
              <span>Dark</span>
              {theme === 'dark' && <span className="text-xs opacity-70 font-normal">(active)</span>}
            </button>
          </div>
        </div>

        {/* Live preview hint */}
        <p className="text-slate-400 dark:text-gray-600 text-xs mt-4 pl-px">
          Your preference is saved automatically and persists across sessions.
        </p>
      </div>

      {/* ── Patient Information ────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900/60
                      border border-slate-200 dark:border-gray-800
                      rounded-2xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold text-base mb-5 flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400">👤</span> Patient Information
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name">
            <input type="text" value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Ahmad Al-Hassan" className="input-field" />
          </Field>

          <Field label="Age">
            <input type="number" min={1} max={120} value={form.age || ''}
              onChange={(e) => updateField('age', Number(e.target.value))}
              placeholder="e.g. 42" className="input-field" />
          </Field>

          <Field label="Diagnosis / Condition">
            <input type="text" value={form.condition}
              onChange={(e) => updateField('condition', e.target.value)}
              className="input-field" />
          </Field>

          <Field label="Physiotherapist Name">
            <input type="text" value={form.physioName}
              onChange={(e) => updateField('physioName', e.target.value)}
              placeholder="e.g. Dr. Sarah Ahmed" className="input-field" />
          </Field>

          <Field label="Rehab Phase">
            <select value={form.rehabPhase}
              onChange={(e) => updateField('rehabPhase', e.target.value as RehabPhase)}
              className="input-field">
              {REHAB_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field label="Daily Goal (sets)">
            <input type="number" min={1} max={10} value={form.dailyGoalSets}
              onChange={(e) => updateField('dailyGoalSets', Number(e.target.value))}
              className="input-field" />
          </Field>

          <Field label="Target Reps per Set">
            <input type="number" min={1} max={50} value={form.targetRepsPerSet}
              onChange={(e) => updateField('targetRepsPerSet', Number(e.target.value))}
              className="input-field" />
          </Field>
        </div>

        <button
          onClick={handleSaveProfile}
          className={`mt-5 flex items-center gap-2 font-semibold text-sm rounded-xl
                      px-6 py-3 transition-colors ${
            saved
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-700 hover:bg-indigo-600 text-white'
          }`}
        >
          {saved ? '✓ Saved!' : 'Save Profile'}
        </button>
      </div>

      {/* ── Clinician Report ───────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900/60
                      border border-slate-200 dark:border-gray-800
                      rounded-2xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold text-base mb-2 flex items-center gap-2">
          <span>📱</span> 1-Click Clinician Summary
        </h2>
        <p className="text-slate-500 dark:text-gray-500 text-sm mb-4">
          Copy and paste directly into WhatsApp or email to your physiotherapist.
        </p>

        <div className="bg-slate-50 dark:bg-gray-800/60
                        border border-slate-200 dark:border-gray-700/50
                        rounded-xl p-4 mb-4">
          <p className="text-slate-700 dark:text-gray-300 text-sm leading-relaxed font-mono break-words">
            {clinicianReport}
          </p>
        </div>

        <button
          onClick={() => void handleCopyReport()}
          className={`flex items-center gap-2 font-semibold text-sm rounded-xl
                      px-6 py-3 transition-colors ${
            copied
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-200'
          }`}
        >
          {copied ? '✓ Copied to Clipboard!' : '📋 Copy Report'}
        </button>
      </div>

      {/* ── Download Data ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900/60
                      border border-slate-200 dark:border-gray-800
                      rounded-2xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold text-base mb-2 flex items-center gap-2">
          <span>💾</span> Download Session Data
        </h2>
        <p className="text-slate-500 dark:text-gray-500 text-sm mb-4">
          Export all {sessions.length} sessions for clinical analysis or thesis documentation.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => exportJSON(sessions)}
            disabled={sessions.length === 0}
            className="flex items-center gap-2
                       bg-indigo-50 dark:bg-indigo-900/60
                       hover:bg-indigo-100 dark:hover:bg-indigo-900
                       border border-indigo-200 dark:border-indigo-700/60
                       text-indigo-700 dark:text-indigo-300
                       font-medium text-sm rounded-xl px-5 py-2.5 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↓ Download JSON
          </button>
          <button
            onClick={() => exportCSV(sessions)}
            disabled={sessions.length === 0}
            className="flex items-center gap-2
                       bg-emerald-50 dark:bg-emerald-900/40
                       hover:bg-emerald-100 dark:hover:bg-emerald-900
                       border border-emerald-200 dark:border-emerald-700/60
                       text-emerald-700 dark:text-emerald-400
                       font-medium text-sm rounded-xl px-5 py-2.5 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↓ Download CSV
          </button>
        </div>
      </div>

      {/* ── Privacy & Cache ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900/60
                      border border-slate-200 dark:border-gray-800
                      rounded-2xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold text-base mb-4 flex items-center gap-2">
          <span>🔒</span> Privacy &amp; Local Cache
        </h2>

        <div className="flex items-center justify-between
                        bg-slate-50 dark:bg-gray-800/50
                        rounded-xl px-4 py-3 mb-4">
          <div>
            <div className="text-slate-700 dark:text-gray-300 text-sm font-medium">Browser Storage Used</div>
            <div className="text-slate-400 dark:text-gray-500 text-xs">{sessions.length} sessions · Profile data</div>
          </div>
          <div className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">{storageKB} KB</div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSeedDemo}
            className="flex items-center gap-2
                       bg-amber-50 dark:bg-amber-900/40
                       hover:bg-amber-100 dark:hover:bg-amber-900/70
                       border border-amber-200 dark:border-amber-700/60
                       text-amber-700 dark:text-amber-400
                       font-medium text-sm rounded-xl px-5 py-2.5 transition-colors"
          >
            🗂 Load Demo Data
          </button>

          <button
            onClick={handleClear}
            className={`flex items-center gap-2 font-medium text-sm rounded-xl px-5 py-2.5
                        transition-colors border ${
              confirmClear
                ? 'bg-red-600 border-red-500 text-white animate-pulse'
                : 'bg-slate-100 dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700/60 hover:text-red-600 dark:hover:text-red-400'
            }`}
          >
            {confirmClear ? '⚠️ Confirm — Delete All Data?' : '🗑 Clear All Local Data'}
          </button>
        </div>

        {confirmClear && (
          <p className="text-red-500 dark:text-red-400 text-xs mt-3">
            This will permanently delete your profile and all session history from this browser.
          </p>
        )}

        <div className="mt-5 p-4
                        bg-emerald-50 dark:bg-emerald-950/40
                        border border-emerald-200 dark:border-emerald-800/40
                        rounded-xl">
          <p className="text-emerald-700 dark:text-emerald-400 text-xs font-medium mb-1">🔒 Zero-Cloud Privacy Guarantee</p>
          <p className="text-slate-500 dark:text-gray-500 text-xs leading-relaxed">
            All data — video frames, pose coordinates, and session history — is processed and stored
            exclusively in your browser's RAM and localStorage. Nothing is transmitted to any server.
            Clearing browser data or using incognito mode will remove all history.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Reusable form field wrapper ────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-slate-500 dark:text-gray-400 text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
