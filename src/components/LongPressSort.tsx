import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tick } from '../lib/touch';

const HOLD_MS = 380; // quanto tempo segurar para "pegar" o item
const SLOP = 8; // mexer mais que isso antes de pegar = rolar a tela

interface Gesture {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  lastY: number;
  scroll: number;
  step: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  el: HTMLElement;
}

/**
 * Lista que dá para reordenar segurando um item e arrastando (como os ícones do iPhone).
 * Um toque normal continua abrindo o item e arrastar sem segurar continua rolando a tela.
 */
export function LongPressSort({ ids, onReorder, children }: { ids: string[]; onReorder: (ids: string[]) => void; children: (id: string) => ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const justDropped = useRef(false);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; step: number } | null>(null);
  // Ordem nova logo depois de soltar, até o banco devolver a mesma ordem (evita o item "pular" de volta).
  const [pending, setPending] = useState<string[] | null>(null);
  const shown = pending && pending.length === ids.length && pending.every((id) => ids.includes(id)) ? pending : ids;

  useEffect(() => {
    if (pending && pending.join() === ids.join()) setPending(null);
  }, [ids, pending]);

  // Enquanto arrasta, a tela não rola junto com o dedo.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (g.current?.active && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const update = () => {
    const s = g.current;
    if (!s?.active) return;
    const dy = s.lastY - s.y + (window.scrollY - s.scroll);
    const to = Math.max(0, Math.min(shown.length - 1, Math.round(s.index + dy / s.step)));
    setDrag({ from: s.index, to, dy, step: s.step });
  };

  // Perto das bordas da tela, a lista rola sozinha.
  const autoScroll = () => {
    const s = g.current;
    if (!s?.active) return;
    const top = 110;
    const bottom = window.innerHeight - 190;
    const speed = s.lastY < top ? -(top - s.lastY) / 6 : s.lastY > bottom ? (s.lastY - bottom) / 6 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      update();
    }
    frame.current = requestAnimationFrame(autoScroll);
  };

  const activate = () => {
    const s = g.current;
    const list = listRef.current;
    if (!s || !list) return;
    const rows = [...list.children] as HTMLElement[];
    s.active = true;
    s.step = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : s.el.offsetHeight;
    try {
      s.el.setPointerCapture(s.pointerId);
    } catch {
      // sem captura
    }
    list.setAttribute('data-drag-lock', '');
    tick();
    setDrag({ from: s.index, to: s.index, dy: 0, step: s.step });
    frame.current = requestAnimationFrame(autoScroll);
  };

  const finish = () => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    if (!s.active) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    const dy = s.lastY - s.y + (window.scrollY - s.scroll);
    const to = Math.max(0, Math.min(shown.length - 1, Math.round(s.index + dy / s.step)));
    if (to !== s.index) {
      const next = shown.slice();
      const [moved] = next.splice(s.index, 1);
      next.splice(to, 0, moved);
      setPending(next);
      onReorder(next);
    }
    setDrag(null);
    // O toque que termina o arraste não abre o item.
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
      listRef.current?.removeAttribute('data-drag-lock');
    }, 350);
  };

  const onPointerDown = (index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.current) return;
    const s: Gesture = {
      index,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastY: e.clientY,
      scroll: window.scrollY,
      step: 0,
      active: false,
      timer: null,
      el: e.currentTarget,
    };
    s.timer = setTimeout(activate, HOLD_MS);
    g.current = s;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.active) {
      if (Math.abs(e.clientX - s.x) > SLOP || Math.abs(e.clientY - s.y) > SLOP) {
        if (s.timer) clearTimeout(s.timer);
        g.current = null;
      }
      return;
    }
    s.lastY = e.clientY;
    update();
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (justDropped.current || g.current?.active) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const shift = (k: number): string | undefined => {
    if (!drag) return undefined;
    if (k === drag.from) return `translateY(${drag.dy}px)`;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return `translateY(${-drag.step}px)`;
    if (drag.from > drag.to && k < drag.from && k >= drag.to) return `translateY(${drag.step}px)`;
    return undefined;
  };

  return (
    <div ref={listRef} className={`lp-sort ${drag ? 'sorting' : ''}`}>
      {shown.map((id, k) => (
        <div
          key={id}
          className={`lp-item ${drag?.from === k ? 'lifted' : ''}`}
          style={{ transform: shift(k) }}
          onPointerDown={onPointerDown(k)}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onClickCapture={onClickCapture}
          onContextMenu={(e) => e.preventDefault()}
        >
          {children(id)}
        </div>
      ))}
    </div>
  );
}
