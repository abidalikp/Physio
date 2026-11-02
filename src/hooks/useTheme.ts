// ──────────────────────────────────────────────────────────────
// hooks/useTheme.ts — Theme manager (light is default)
// Applies 'dark' class to <html> for Tailwind darkMode: 'class'
// ──────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pt_theme';

function applyThemeClass(theme: Theme): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      return stored === 'dark' ? 'dark' : 'light'; // light is the default
    } catch {
      return 'light';
    }
  });

  // Sync class on every change (and on mount for safety)
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = (t: Theme): void => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* quota */ }
    applyThemeClass(t);
  };

  const toggleTheme = (): void => setTheme(theme === 'light' ? 'dark' : 'light');

  return { theme, setTheme, toggleTheme };
}
