import { memo, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { tick } from '../lib/touch';
import { Sheet } from './Sheet';

const ITEM = 40; // altura de cada número na roleta
const MAX_MIN = 240;

export const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const MINUTES = range(0, MAX_MIN);
const SECONDS = range(0, 59).map((s) => String(s).padStart(2, '0'));

/**
 * Uma roleta (como o timer do iPhone): gira com o dedo e para no número do meio.
 * A coluna inteira rola (não só em cima do número). Ao rolar, só troca o destaque dos números,
 * sem redesenhar a lista; avisa o número escolhido por onChange.
 */
export const Wheel = memo(function Wheel({
  values,
  index,
  unit,
  label,
  onChange,
}: {
  values: readonly (string | number)[];
  /** Onde começa (posição na lista). */
  index: number;
  unit?: string;
  label: string;
  onChange: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef(-1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const paint = (i: number) => {
    const el = ref.current;
    if (!el || i === current.current) return;
    const items = el.children; // [espaço, ...números, espaço]
    const prev = current.current;
    for (const k of [prev - 1, prev, prev + 1]) items[k + 1]?.classList.remove('on', 'near');
    items[i + 1]?.classList.add('on');
    if (i > 0) items[i]?.classList.add('near');
    if (i < values.length - 1) items[i + 2]?.classList.add('near');
    if (prev >= 0) tick();
    current.current = i;
    onChangeRef.current(i);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(values.length - 1, index));
    el.scrollTop = i * ITEM;
    paint(i);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint(Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM))));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, [values.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`wheel ${unit ? 'has-unit' : ''}`}>
      <div className="wheel-scroll" ref={ref} aria-label={label}>
        <div className="wheel-pad" aria-hidden="true" />
        {values.map((v, i) => (
          <button key={i} type="button" tabIndex={-1} className="wheel-item" onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}>
            {v}
          </button>
        ))}
        <div className="wheel-pad" aria-hidden="true" />
      </div>
      {unit && <span className="wheel-unit">{unit}</span>}
    </div>
  );
},
// Só redesenha se a lista mudar (o onChange fica guardado e a posição inicial só vale ao abrir).
(a, b) => a.values === b.values && a.unit === b.unit && a.label === b.label);

/** Grupo de roletas com uma faixa de seleção própria e um título em cima (ex.: "Kg", "Reps"). */
export function WheelGroup({ head, size = 1, children }: { head?: string; size?: number; children: ReactNode }) {
  return (
    <div className="wheel-group" style={{ flex: size }}>
      {head && <span className="wheel-head">{head}</span>}
      <div className="wheel-row">
        <div className="wheels-band" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** Separador entre duas roletas do mesmo grupo (",", "–"). */
export function WheelSep({ children }: { children: ReactNode }) {
  return (
    <span className="wheel-sep" aria-hidden="true">
      {children}
    </span>
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
  const min = useRef(Math.floor(initial / 60));
  const sec = useRef(initial % 60);
  useEffect(() => {
    if (!open) return;
    min.current = Math.floor(initial / 60);
    sec.current = initial % 60;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="wheels" aria-label="Escolher minutos e segundos">
        <WheelGroup>
          <Wheel values={MINUTES} index={Math.floor(initial / 60)} unit="min" label="Minutos" onChange={(i) => (min.current = MINUTES[i])} />
          <Wheel values={SECONDS} index={initial % 60} unit="seg" label="Segundos" onChange={(i) => (sec.current = i)} />
        </WheelGroup>
      </div>
      <div className="stack">
        <button type="button" className="btn big block primary" onClick={() => onDone(min.current * 60 + sec.current || null)}>
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
