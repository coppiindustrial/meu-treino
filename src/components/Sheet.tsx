import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  hideClose?: boolean;
}

export function Sheet({ open, onClose, title, subtitle, children, hideClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
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
        {children}
      </div>
    </div>,
    document.body,
  );
}
