// ──────────────────────────────────────────────────────────────
// views/ProgressDashboard.tsx — View 2: Analytics & History
// Uses pure inline SVG — no external chart library.
// ──────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import type { WorkoutSession, UserProfile } from '../types';
import { deleteSession } from '../storage';

interface ProgressDashboardProps {
  sessions: WorkoutSession[];
  profile: UserProfile;
  onDataChange: () => void;
  isDark: boolean;
}

// ── Helpers ────────────────────────────────────────────────────

function dayKey(date: string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── KPI computations ───────────────────────────────────────────

function computeStreak(sessions: WorkoutSession[]): number {
  const days = [...new Set(sessions.map((s) => dayKey(s.date)))].sort().reverse();
  if (days.length === 0) return 0;
  let streak = 0;
  let cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  for (const d of days) {
    const day  = new Date(d);
    const diff = Math.round((cursor.getTime() - day.getTime()) / 86_400_000);
    if (diff === 0 || diff === 1) { streak++; cursor = day; }
    else break;
  }
  return streak;
}

function last7DaysReps(sessions: WorkoutSession[]): { label: string; reps: number }[] {
  const map = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of sessions) {
    const k = dayKey(s.date);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + s.repsCompleted);
  }
  return [...map.entries()].map(([k, reps]) => ({
    label: new Date(k).toLocaleDateString(undefined, { weekday: 'short' }),
    reps,
  }));
}

// ── SVG Bar Chart ──────────────────────────────────────────────

function BarChart({
  data,
  goalLine,
  isDark,
}: {
  data: { label: string; reps: number }[];
  goalLine: number;
  isDark: boolean;
}) {
  const W = 600; const H = 160;
  const padL = 36; const padR = 12; const padT = 16; const padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...data.map((d) => d.reps), goalLine, 1);
  const barW = chartW / data.length;
  const barPad = barW * 0.25;
  const toY = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const goalY = toY(goalLine);

  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.4)';
  const barLabelColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const emptyBarColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y   = padT + chartH * (1 - t);
        const val = Math.round(maxVal * t);
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={gridColor} strokeWidth={1} />
            <text x={padL - 4} y={y + 4} fill={labelColor} fontSize={9} textAnchor="end">{val}</text>
          </g>
        );
      })}

      <line x1={padL} y1={goalY} x2={W - padR} y2={goalY} stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={W - padR + 2} y={goalY + 4} fill="#F59E0B" fontSize={9}>Goal</text>

      {data.map(({ label, reps }, i) => {
        const x   = padL + i * barW + barPad / 2;
        const bw  = barW - barPad;
        const by  = toY(reps);
        const bh  = padT + chartH - by;
        const fill = reps >= goalLine ? '#10B981' : reps > 0 ? '#6366F1' : emptyBarColor;
        return (
          <g key={i}>
            <rect x={x} y={reps > 0 ? by : padT + chartH - 1} width={bw}
              height={reps > 0 && bh > 0 ? bh : 1} rx={3} fill={fill} opacity={0.85} />
            {reps > 0 && (
              <text x={x + bw / 2} y={by - 3} fill={barLabelColor} fontSize={9} textAnchor="middle">{reps}</text>
            )}
            <text x={x + bw / 2} y={H - padB + 14} fill={labelColor} fontSize={10} textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Pain vs ROM dual-axis chart ────────────────────────────────

function PainRomChart({ sessions, isDark }: { sessions: WorkoutSession[]; isDark: boolean }) {
  const data = useMemo(() => (
    [...sessions].filter((s) => s.bestRomAngle > 0).reverse().slice(-12).map((s) => ({
      pain:  s.painLevelAfter,
      rom:   s.bestRomAngle,
      label: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }))
  ), [sessions]);

  if (data.length < 2) {
    return (
      <div className="h-28 flex items-center justify-center text-slate-400 dark:text-gray-600 text-sm">
        Complete more sessions to see this chart
      </div>
    );
  }

  const W = 600; const H = 160;
  const padL = 36; const padR = 36; const padT = 16; const padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = data.length;
  const xStep = chartW / Math.max(n - 1, 1);
  const toX = (i: number) => padL + i * xStep;
  const painToY = (v: number) => padT + chartH - ((v - 1) / 9) * chartH;
  const romToY  = (v: number) => {
    const romMin = Math.min(...data.map((d) => d.rom));
    const romMax = Math.max(...data.map((d) => d.rom));
    return padT + chartH - ((v - romMin) / (romMax - romMin || 1)) * chartH;
  };
  const painPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${painToY(d.pain)}`).join(' ');
  const romPath  = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${romToY(d.rom)}`).join(' ');

  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
  const legendColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {[0, 0.5, 1].map((t) => {
        const y = padT + chartH * (1 - t);
        return <line key={t} x1={padL} y1={y} x2={W - padR} y2={y} stroke={gridColor} strokeWidth={1} />;
      })}

      <path d={romPath}  fill="none" stroke="#818CF8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={`rom-${i}`} cx={toX(i)} cy={romToY(d.rom)} r={3} fill="#818CF8" />)}

      <path d={painPath} fill="none" stroke="#F87171" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={`pain-${i}`} cx={toX(i)} cy={painToY(d.pain)} r={3} fill="#F87171" />)}

      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={i} x={toX(i)} y={H - padB + 14} fill={labelColor} fontSize={9} textAnchor="middle">{d.label}</text>
        ) : null,
      )}

      <circle cx={padL + 4} cy={padT - 4} r={4} fill="#F87171" />
      <text x={padL + 12} y={padT - 1} fill={legendColor} fontSize={9}>Pain</text>
      <circle cx={padL + 48} cy={padT - 4} r={4} fill="#818CF8" />
      <text x={padL + 56} y={padT - 1} fill={legendColor} fontSize={9}>ROM°</text>
    </svg>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────

export function ProgressDashboard({ sessions, profile, onDataChange, isDark }: ProgressDashboardProps) {
  const dailyGoalReps = profile.targetRepsPerSet * profile.dailyGoalSets;

  const kpis = useMemo(() => {
    const streak = computeStreak(sessions);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const thisWeek = sessions.filter((s) => new Date(s.date).getTime() > weekAgo);
    const weeklyReps = thisWeek.reduce((a, s) => a + s.repsCompleted, 0);
    const weeklyTarget = dailyGoalReps * 7;
    const weeklyPct = weeklyTarget > 0 ? Math.min(100, Math.round((weeklyReps / weeklyTarget) * 100)) : 0;
    const totalReps = sessions.reduce((a, s) => a + s.repsCompleted, 0);
    const painSessions = sessions.filter((s) => s.painLevelAfter > 0);
    const first3 = painSessions.slice(-3).map((s) => s.painLevelAfter);
    const last3  = painSessions.slice(0, 3).map((s) => s.painLevelAfter);
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const painTrend = avg(last3) - avg(first3);
    return { streak, weeklyPct, totalReps, painTrend, weeklyReps };
  }, [sessions, dailyGoalReps]);

  const barData = useMemo(() => last7DaysReps(sessions), [sessions]);

  const handleDelete = (id: string) => { deleteSession(id); onDataChange(); };

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Adherence Streak',
            value: `${kpis.streak}d`,
            sub: 'consecutive days',
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/40',
          },
          {
            label: 'Weekly Completion',
            value: `${kpis.weeklyPct}%`,
            sub: `${kpis.weeklyReps} reps done`,
            color: kpis.weeklyPct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
              : kpis.weeklyPct >= 50 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400',
            bg: 'bg-white dark:bg-gray-900/60 border-slate-200 dark:border-gray-800',
          },
          {
            label: 'Total Reps',
            value: kpis.totalReps.toLocaleString(),
            sub: 'lifetime',
            color: 'text-indigo-600 dark:text-indigo-400',
            bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40',
          },
          {
            label: 'Pain Trend',
            value: kpis.painTrend < -0.5 ? '↓ Improving' : kpis.painTrend > 0.5 ? '↑ Worsening' : '→ Stable',
            sub: 'first 3 vs latest 3',
            color: kpis.painTrend < -0.5 ? 'text-emerald-600 dark:text-emerald-400'
              : kpis.painTrend > 0.5 ? 'text-red-600 dark:text-red-400'
              : 'text-amber-600 dark:text-amber-400',
            bg: 'bg-white dark:bg-gray-900/60 border-slate-200 dark:border-gray-800',
          },
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} className={`rounded-2xl border p-4 ${bg}`}>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-600 dark:text-gray-400 text-xs mt-0.5">{label}</div>
            <div className="text-slate-400 dark:text-gray-600 text-xs">{sub}</div>
          </div>
        ))}
      </div>

      {/* 7-day bar chart */}
      <div className="bg-white dark:bg-gray-900/60 border border-slate-200 dark:border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-900 dark:text-white font-semibold text-sm">7-Day Rep Volume</h3>
          <span className="text-xs text-amber-600 dark:text-amber-400">— Daily goal ({dailyGoalReps} reps)</span>
        </div>
        <BarChart data={barData} goalLine={dailyGoalReps} isDark={isDark} />
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-slate-500 dark:text-gray-500 text-xs">Goal met</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-500" /><span className="text-slate-500 dark:text-gray-500 text-xs">Partial</span></div>
        </div>
      </div>

      {/* Pain vs ROM chart */}
      <div className="bg-white dark:bg-gray-900/60 border border-slate-200 dark:border-gray-800 rounded-2xl p-5">
        <h3 className="text-slate-900 dark:text-white font-semibold text-sm mb-4">Pain Score vs Peak ROM Progression</h3>
        <PainRomChart sessions={sessions} isDark={isDark} />
        <p className="text-slate-400 dark:text-gray-600 text-xs mt-2">
          Red = pain trend, Indigo = ROM trend. Ideal: pain ↓, ROM stable.
        </p>
      </div>

      {/* Session log table */}
      <div className="bg-white dark:bg-gray-900/60 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-gray-800">
          <h3 className="text-slate-900 dark:text-white font-semibold text-sm">Session History</h3>
          <p className="text-slate-500 dark:text-gray-500 text-xs mt-0.5">{sessions.length} sessions recorded</p>
        </div>

        {sessions.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 dark:text-gray-600 text-sm">
            No sessions yet — complete a workout to see history here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-gray-800">
                  {['Date', 'Exercise', 'Reps', 'Peak ROM', 'Duration', 'Pain', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-slate-500 dark:text-gray-500 text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={s.id}
                    className={`border-b border-slate-100 dark:border-gray-800/50
                                hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors
                                ${i === 0 ? 'bg-slate-50/50 dark:bg-gray-800/20' : ''}`}>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-400 text-xs whitespace-nowrap">{formatDate(s.date)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-200 text-xs">{s.exerciseName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${s.repsCompleted >= s.targetReps ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {s.repsCompleted}
                      </span>
                      <span className="text-slate-400 dark:text-gray-600">/{s.targetReps}</span>
                    </td>
                    <td className="px-4 py-3 text-indigo-600 dark:text-indigo-400 text-xs">
                      {s.bestRomAngle > 0 ? `${s.bestRomAngle.toFixed(0)}°` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-400 text-xs">{formatDuration(s.durationSeconds)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block w-6 h-6 rounded-full text-xs font-bold text-center leading-6
                        ${s.painLevelAfter <= 3 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                          : s.painLevelAfter <= 6 ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-400'}`}>
                        {s.painLevelAfter}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-slate-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded"
                        title="Delete session"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
