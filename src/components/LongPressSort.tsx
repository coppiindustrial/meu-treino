import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tick } from '../lib/touch';

const HOLD_MS = 380; // quanto tempo segurar para "pegar" o item
const SLOP = 8; // mexer mais que isso antes de pegar = rolar a tela
const LAND_MS = 300; // o item "pousa" do dedo até o lugar dele

interface Gesture {
  index: number;
  id: string;
  pointerId: number;
  x: number;
  y: number;
  lastY: number;
  scroll: number;
  active: boolean;
  /** Já mexeu o dedo depois de pegar (só então a lista rola sozinha perto das bordas). */
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  el: HTMLElement;
  /** Topo e altura de cada linha na página, medidos ao pegar (as linhas podem ter alturas diferentes). */
  rows: { top: number; h: number }[];
  /** Quanto os vizinhos andam para abrir espaço: a altura do item pego mais o espaço entre linhas. */
  gapH: number;
  to: number;
  lastFrame: number;
}

/**
 * Lista que dá para reordenar segurando um item e arrastando (como os ícones do iPhone).
 * Um toque normal continua abrindo o item e arrastar sem segurar continua rolando a tela.
 */
export function LongPressSort({ ids, onReorder, className = '', children }: { ids: string[]; onReorder: (ids: string[]) => void; className?: string; children: (id: string) => ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const justDropped = useRef(false);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; gapH: number } | null>(null);
  // Depois de soltar: onde o item estava na tela, para ele pousar dali até o lugar novo.
  const [landing, setLanding] = useState<{ id: string; top: number } | null>(null);
  // No quadro em que a lista muda de ordem, sem animações (senão os vizinhos pulam e o item "voa").
  const [settling, setSettling] = useState(false);
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

  // Ao soltar, os vizinhos já estão no lugar certo (sem animação nesse quadro) e o item pousa suave do dedo até a vaga.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!landing || !list) return;
    const el = list.querySelector<HTMLElement>(`:scope > [data-lp="${CSS.escape(landing.id)}"]`);
    if (el) {
      const delta = landing.top - el.getBoundingClientRect().top;
      if (Math.abs(delta) > 1 && el.animate) {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration: LAND_MS,
          easing: 'cubic-bezier(0.3, 1.2, 0.5, 1)',
        });
      }
    }
    // Dois quadros depois, as animações dos vizinhos voltam; o visual de "pego" some aos poucos.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSettling(false));
    });
    const t = setTimeout(() => setLanding(null), 130);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, [landing]);

  /** Vaga de destino: o centro do item pego contra o meio de cada vizinho. */
  const target = (s: Gesture, dy: number): number => {
    const me = s.rows[s.index];
    const c = me.top + me.h / 2 + dy;
    let to = s.index;
    s.rows.forEach((r, k) => {
      if (k === s.index) return;
      const mid = r.top + r.h / 2;
      if (k > s.index && c >= mid - 2) to = Math.max(to, k);
      if (k < s.index && c <= mid + 2) to = Math.min(to, k);
    });
    return to;
  };

  const update = () => {
    const s = g.current;
    if (!s?.active) return;
    const dy = s.lastY - s.y + (window.scrollY - s.scroll);
    const to = target(s, dy);
    if (to !== s.to) {
      s.to = to;
      tick();
    }
    setDrag({ from: s.index, to, dy, gapH: s.gapH });
  };

  // Perto das bordas da tela a lista rola sozinha, só depois de mexer o dedo e com velocidade limitada.
  const autoScroll = (now: number) => {
    const s = g.current;
    if (!s?.active) return;
    const dt = Math.min(48, now - (s.lastFrame || now));
    s.lastFrame = now;
    if (s.moved) {
      const top = 100;
      const bottom = window.innerHeight - 140;
      const into = s.lastY < top ? -(top - s.lastY) : s.lastY > bottom ? s.lastY - bottom : 0;
      if (into) {
        const speed = Math.max(-14, Math.min(14, into / 5)); // px a cada 16 ms
        window.scrollBy(0, (speed * dt) / 16);
        update();
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  };

  const activate = () => {
    const s = g.current;
    const list = listRef.current;
    if (!s || !list) return;
    const rows = [...list.children] as HTMLElement[];
    s.rows = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return { top: b.top + window.scrollY, h: b.height };
    });
    s.scroll = window.scrollY;
    const gap = s.rows.length > 1 ? Math.max(0, s.rows[1].top - (s.rows[0].top + s.rows[0].h)) : 0;
    s.gapH = s.rows[s.index].h + gap;
    s.active = true;
    s.to = s.index;
    try {
      s.el.setPointerCapture(s.pointerId);
    } catch {
      // sem captura
    }
    list.setAttribute('data-drag-lock', '');
    window.getSelection()?.removeAllRanges();
    (document.activeElement as HTMLElement | null)?.blur?.();
    tick();
    setDrag({ from: s.index, to: s.index, dy: 0, gapH: s.gapH });
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
    const to = target(s, dy);
    // Onde o item está agora na tela: ele pousa daqui até a vaga (no lugar de pular ou "voar").
    setSettling(true);
    setLanding({ id: s.id, top: s.el.getBoundingClientRect().top });
    if (to !== s.index) {
      const next = shown.slice();
      const [moved] = next.splice(s.index, 1);
      next.splice(to, 0, moved);
      setPending(next);
      onReorder(next);
    }
    setDrag(null);
    // Limpa o que o toque longo possa ter deixado marcado no item (efeito de apertado, foco do link).
    s.el.querySelectorAll('.pressed').forEach((n) => n.classList.remove('pressed'));
    (document.activeElement as HTMLElement | null)?.blur?.();
    // O toque que termina o arraste não abre o item.
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
      listRef.current?.removeAttribute('data-drag-lock');
    }, 350);
  };

  const onPointerDown = (index: number, id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.current) return;
    const s: Gesture = {
      index,
      id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastY: e.clientY,
      scroll: window.scrollY,
      active: false,
      moved: false,
      timer: null,
      el: e.currentTarget,
      rows: [],
      gapH: 0,
      to: index,
      lastFrame: 0,
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
    if (Math.abs(e.clientY - s.y) > 6) s.moved = true;
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
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return `translateY(${-drag.gapH}px)`;
    if (drag.from > drag.to && k < drag.from && k >= drag.to) return `translateY(${drag.gapH}px)`;
    return undefined;
  };

  return (
    <div ref={listRef} className={`lp-sort ${className} ${drag ? 'sorting' : ''} ${settling ? 'settling' : ''}`}>
      {shown.map((id, k) => (
        <div
          key={id}
          data-lp={id}
          className={`lp-item ${drag?.from === k ? 'lifted' : ''} ${landing?.id === id ? 'landing' : ''}`}
          style={{ transform: shift(k) }}
          onPointerDown={onPointerDown(k, id)}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onClickCapture={onClickCapture}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {children(id)}
        </div>
      ))}
    </div>
  );
}
