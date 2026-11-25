import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardInset } from '../lib/hooks';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  hideClose?: boolean;
}

// Trava a rolagem da página enquanto houver alguma janela aberta. Com janela em cima de
// janela (ex.: confirmação por cima de um menu), só destrava quando a última fecha.
let openSheets = 0;

function lockScroll(): void {
  openSheets += 1;
  document.body.style.overflow = 'hidden';
}

function unlockScroll(): void {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) document.body.style.overflow = '';
}

/** Tempo da descida ao fechar (igual à transição do `.sheet` no CSS). */
const EXIT_MS = 240;

const DismissContext = createContext<(() => void) | null>(null);

/**
 * Fecha a janela em que o componente está descendo com animação, como quando se arrasta para
 * baixo. Fora de uma janela, não faz nada.
 */
export function useSheetDismiss(): () => void {
  return useContext(DismissContext) ?? noop;
}

function noop(): void {}

/** Solto longe o bastante (ou com um puxão rápido), o menu desce e fecha. */
function releaseCloses(dy: number, ms: number): boolean {
  const speed = dy / Math.max(1, ms);
  return dy > 110 || (dy > 30 && speed > 0.6);
}

/**
 * O dedo pode puxar a janela pelo conteúdo? Não quando começa num campo, numa alça de arrastar,
 * numa roleta ou em qualquer coisa que role ou tenha gesto próprio.
 */
function contentCanPull(target: Element | null, sheet: HTMLElement): boolean {
  for (let el = target; el && el !== sheet; el = el.parentElement) {
    if (el === document.activeElement && el.matches('input')) return false;
    if (el.matches('textarea, select, input[type="range"], [contenteditable], .reorder-grip, .drag-handle, [data-no-sheet-drag]')) return false;
    const css = getComputedStyle(el);
    if (css.touchAction === 'none') return false;
    if ((css.overflowY === 'auto' || css.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return false;
  }
  return true;
}

export function Sheet({ open, onClose, title, subtitle, children, hideClose }: Props) {
  const { inset, viewportHeight } = useKeyboardInset(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const insetRef = useRef(inset);
  insetRef.current = inset;

  // Continua na tela enquanto desce, mesmo depois de `open` virar falso. O conteúdo fica como
  // estava (a tela de trás costuma limpar o que a janela mostrava assim que ela fecha).
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const shownRef = useRef(open);
  const kept = useRef({ title, subtitle, children });
  if (open) kept.current = { title, subtitle, children };

  // Arrastar para baixo fecha, como no iPhone: o menu segue o dedo e, solto longe o bastante
  // (ou com um puxão rápido), desce e fecha; senão volta para o lugar.
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const dismiss = useCallback(() => {
    if (closingRef.current || !openRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setDragging(false);
    setTimeout(() => onCloseRef.current(), EXIT_MS);
  }, []);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      shownRef.current = true;
      setShown(true);
      setClosing(false);
      setDrag(0);
      setDragging(false);
      return;
    }
    if (!shownRef.current) return;
    const hide = () => {
      closingRef.current = false;
      shownRef.current = false;
      setShown(false);
      setClosing(false);
    };
    // Fechou depois de já ter descido (pelo dedo, pelo fundo ou pelo X): some na hora.
    if (closingRef.current) return hide();
    // Fechou por um botão de dentro ou pela tela de trás: desce antes de sumir.
    setClosing(true);
    const timer = setTimeout(hide, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Mouse (computador): arrasta pela faixa do topo. O dedo é tratado mais abaixo.
  const grab = useRef<{ y: number; t: number; id: number; active: boolean } | null>(null);
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || closingRef.current) return;
    grab.current = { y: e.clientY, t: performance.now(), id: e.pointerId, active: false };
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) < 6) return;
      g.active = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag(dy > 0 ? dy : dy / 4);
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    grab.current = null;
    if (!g || !g.active) return;
    setDragging(false);
    if (releaseCloses(e.clientY - g.y, performance.now() - g.t)) dismiss();
    else setDrag(0);
  };
  const onGrabCancel = () => {
    if (!grab.current) return;
    grab.current = null;
    setDragging(false);
    setDrag(0);
  };

  // Dedo: puxa pela faixa ou por qualquer ponto da janela quando ela está rolada até o topo
  // (não precisa acertar a faixa). Usa eventos de toque para segurar a rolagem do iPhone.
  const visible = open || shown;
  useEffect(() => {
    const el = sheetRef.current;
    if (!visible || !el) return;
    type Gesture = { x: number; y: number; t: number; mode: 'wait' | 'drag' | 'skip'; grab: boolean };
    let g: Gesture | null = null;
    let unblock: ReturnType<typeof setTimeout> | undefined;

    const stopClick = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closingRef.current) {
        g = null;
        return;
      }
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      const onGrab = !!target?.closest('.sheet-grab');
      const ok = onGrab || (insetRef.current === 0 && el.scrollTop <= 0 && contentCanPull(target, el));
      g = { x: t.clientX, y: t.clientY, t: performance.now(), mode: ok ? 'wait' : 'skip', grab: onGrab };
    };
    const onMove = (e: TouchEvent) => {
      if (!g || g.mode === 'skip' || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (g.mode === 'wait') {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          // Segura o "elástico" do iPhone enquanto decide para onde o dedo vai.
          if (dy > 0 && e.cancelable) e.preventDefault();
          return;
        }
        const pulls = g.grab ? Math.abs(dy) >= Math.abs(dx) : dy > 0 && dy > Math.abs(dx);
        if (!pulls) {
          g.mode = 'skip';
          return;
        }
        g.mode = 'drag';
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault();
      setDrag(dy > 0 ? dy : dy / 4);
    };
    const onEnd = (e: TouchEvent) => {
      const gesture = g;
      g = null;
      if (!gesture || gesture.mode !== 'drag') return;
      setDragging(false);
      const t = e.changedTouches[0];
      const dy = t ? t.clientY - gesture.y : 0;
      if (e.type === 'touchend' && releaseCloses(dy, performance.now() - gesture.t)) dismiss();
      else setDrag(0);
      // O toque que arrastou não vira clique no botão em que começou.
      el.addEventListener('click', stopClick, true);
      clearTimeout(unblock);
      unblock = setTimeout(() => el.removeEventListener('click', stopClick, true), 400);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      clearTimeout(unblock);
      el.removeEventListener('click', stopClick, true);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [visible, dismiss]);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  // Quando um campo recebe foco, espera o teclado subir e mostra o campo.
  useEffect(() => {
    const el = sheetRef.current;
    if (!open || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.matches('input, textarea, select')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => target.scrollIntoView({ block: 'nearest' }), 320);
    };
    el.addEventListener('focusin', onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  if (!visible) return null;
  const leaving = closing || !open;
  const content = open ? { title, subtitle, children } : kept.current;
  const keyboardOpen = inset > 0;
  // O fundo clareia conforme o menu desce.
  const dim = leaving ? 0 : Math.max(0, 1 - Math.max(0, drag) / 400);
  return createPortal(
    <div
      className={`sheet-backdrop ${leaving ? 'closing' : ''}`}
      style={{ paddingBottom: inset, ['--dim' as string]: dim }}
      onClick={dismiss}
    >
      <div
        ref={sheetRef}
        className={`sheet ${keyboardOpen ? 'kb-open' : ''} ${dragging ? 'dragging' : ''}`}
        style={{
          ...(keyboardOpen ? { maxHeight: Math.max(200, viewportHeight - 16) } : {}),
          ...(leaving ? { transform: 'translateY(100%)' } : drag ? { transform: `translateY(${drag}px)` } : {}),
        }}
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabCancel}>
          <div className="sheet-handle" aria-hidden="true" />
          {(content.title || !hideClose) && (
            <div className="row between">
              <div className="col">
                {content.title && <span className="sheet-title">{content.title}</span>}
                {content.subtitle && <span className="small muted">{content.subtitle}</span>}
              </div>
              {!hideClose && (
                <button type="button" className="icon-btn ghost" aria-label="Fechar" onClick={dismiss}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          )}
        </div>
        <DismissContext.Provider value={dismiss}>{content.children}</DismissContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
