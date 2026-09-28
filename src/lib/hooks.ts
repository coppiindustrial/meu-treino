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

/**
 * Quanto do rodapé está coberto pelo teclado (px) e a altura visível da tela.
 * No iPhone o teclado não empurra elementos "fixed", então usamos o visualViewport.
 */
export function useKeyboardInset(active = true): { inset: number; viewportHeight: number } {
  const [state, setState] = useState(() => ({ inset: 0, viewportHeight: window.innerHeight }));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setState({ inset, viewportHeight: Math.round(vv.height) });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return state;
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
