import { useEffect, useState } from 'react';

/** Hora atual, atualizada a cada intervalo (para cronômetros). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Mantém a tela acesa enquanto o treino está aberto (quando o aparelho permite). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const s = await nav.wakeLock!.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // sem permissão: ignora
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) void sentinel.release();
    };
  }, [active]);
}
