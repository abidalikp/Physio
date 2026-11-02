// ──────────────────────────────────────────────────────────────
// hooks/useVoiceCoach.ts — window.speechSynthesis wrapper
// ──────────────────────────────────────────────────────────────
//
// Design contract:
// • speak() cancels any queued utterance before speaking so the
//   synthesis queue never grows and never lags.
// • Debounce: the same text won't fire again within `debounceMs`.
// • Enabled state is managed externally (toggle in UI).
// ──────────────────────────────────────────────────────────────

import { useRef, useCallback } from 'react';

interface UseVoiceCoachOptions {
  enabled: boolean;
  debounceMs?: number;
}

export function useVoiceCoach({ enabled, debounceMs = 1500 }: UseVoiceCoachOptions) {
  const lastTextRef   = useRef<string>('');
  const lastSpokenRef = useRef<number>(0);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      if (!('speechSynthesis' in window)) return;

      const now = Date.now();
      // Debounce: don't repeat the same phrase within debounceMs
      if (text === lastTextRef.current && now - lastSpokenRef.current < debounceMs) return;

      lastTextRef.current   = text;
      lastSpokenRef.current = now;

      // Cancel anything currently queued to prevent lag build-up
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate   = 1.1;
      utterance.pitch  = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    [enabled, debounceMs],
  );

  const cancel = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { speak, cancel };
}
