import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';

const ITEM = 40; // altura de cada número na roleta
const MAX_MIN = 240;

/** Uma roleta de números (como o timer do iPhone): gira com o dedo e para no número do meio. */
function Wheel({ count, value, unit, pad, onChange }: { count: number; value: number; unit: string; pad?: boolean; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ITEM;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const at = () => Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / ITEM)));
    const settle = () => {
      if (timer) clearTimeout(timer);
      onChangeRef.current(at());
    };
    const onScroll = () => {
      const v = at();
      setLive(v);
      onChangeRef.current(v);
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', settle);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', settle);
    };
  }, [count]);

  return (
    <div className="wheel">
      <div className="wheel-scroll" ref={ref}>
        <div style={{ height: ITEM * 2 }} aria-hidden="true" />
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className={`wheel-item ${i === live ? 'on' : ''} ${Math.abs(i - live) === 1 ? 'near' : ''}`}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
          >
            {pad ? String(i).padStart(2, '0') : i}
          </button>
        ))}
        <div style={{ height: ITEM * 2 }} aria-hidden="true" />
      </div>
      <span className="wheel-unit">{unit}</span>
    </div>
  );
}

/** Janela para escolher um tempo em minutos e segundos com duas roletas. */
export function DurationSheet({
  open,
  onClose,
  title,
  start,
  canClear,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Onde as roletas começam, em segundos. */
  start: number;
  canClear: boolean;
  onDone: (secs: number | null) => void;
}) {
  const initial = Math.max(0, Math.min(MAX_MIN * 60 + 59, Math.round(start)));
  const [min, setMin] = useState(Math.floor(initial / 60));
  const [sec, setSec] = useState(initial % 60);
  useEffect(() => {
    if (!open) return;
    setMin(Math.floor(initial / 60));
    setSec(initial % 60);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="wheels" aria-label="Escolher minutos e segundos">
        <div className="wheels-band" aria-hidden="true" />
        <Wheel count={MAX_MIN + 1} value={Math.floor(initial / 60)} unit="min" onChange={setMin} />
        <Wheel count={60} value={initial % 60} unit="seg" pad onChange={setSec} />
      </div>
      <div className="stack">
        <button type="button" className="btn big block primary" onClick={() => onDone(min * 60 + sec || null)}>
          Pronto
        </button>
        {canClear && (
          <button type="button" className="btn big block soft" onClick={() => onDone(null)}>
            Limpar
          </button>
        )}
      </div>
    </Sheet>
  );
}
