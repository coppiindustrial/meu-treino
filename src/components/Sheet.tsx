import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

export function Sheet({ open, onClose, title, subtitle, children, hideClose }: Props) {
  const { inset, viewportHeight } = useKeyboardInset(open);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Arrastar a faixa (ou o título) para baixo fecha, como no iPhone: o menu segue o dedo e,
  // solto longe o bastante (ou com um puxão rápido), desce e fecha; senão volta para o lugar.
  const [drag, setDrag] = useState(0);
  const [closing, setClosing] = useState(false);
  const grab = useRef<{ y: number; t: number; id: number; active: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    setDrag(0);
    setClosing(false);
  }, [open]);
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    grab.current = { y: e.clientY, t: performance.now(), id: e.pointerId, active: false };
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) < 6) return;
      g.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag(dy > 0 ? dy : dy / 4);
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    grab.current = null;
    if (!g || !g.active) return;
    const dy = e.clientY - g.y;
    const speed = dy / Math.max(1, performance.now() - g.t);
    if (dy > 110 || (dy > 30 && speed > 0.6)) {
      setClosing(true);
      setTimeout(onClose, 220);
    } else setDrag(0);
  };
  const onGrabCancel = () => {
    grab.current = null;
    setDrag(0);
  };

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  if (!open) return null;
  const keyboardOpen = inset > 0;
  const dragging = grab.current?.active ?? false;
  // O fundo clareia conforme o menu desce.
  const dim = closing ? 0 : Math.max(0, 1 - Math.max(0, drag) / 400);
  return createPortal(
    <div className="sheet-backdrop" style={{ paddingBottom: inset, ['--dim' as string]: dim }} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`sheet ${keyboardOpen ? 'kb-open' : ''} ${dragging ? 'dragging' : ''}`}
        style={{
          ...(keyboardOpen ? { maxHeight: Math.max(200, viewportHeight - 16) } : {}),
          ...(closing ? { transform: 'translateY(100%)' } : drag ? { transform: `translateY(${drag}px)` } : {}),
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabCancel}>
          <div className="sheet-handle" aria-hidden="true" />
          {(title || !hideClose) && (
            <div className="row between">
              <div className="col">
                {title && <span className="sheet-title">{title}</span>}
                {subtitle && <span className="small muted">{subtitle}</span>}
              </div>
              {!hideClose && (
                <button type="button" className="icon-btn ghost" aria-label="Fechar" onClick={onClose}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
