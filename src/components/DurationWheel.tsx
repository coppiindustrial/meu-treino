import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
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
  onTapCurrent,
}: {
  values: readonly (string | number)[];
  /** Onde começa (posição na lista). */
  index: number;
  unit?: string;
  label: string;
  onChange: (index: number) => void;
  /** Tocar no número já escolhido (o do meio, com tracejado): passa a digitar. */
  onTapCurrent?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef(-1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onTapRef = useRef(onTapCurrent);
  onTapRef.current = onTapCurrent;

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
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className="wheel-item"
            onClick={() => {
              if (i === current.current && onTapRef.current) onTapRef.current();
              else ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' });
            }}
          >
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

/**
 * Grupo de roletas com uma faixa de seleção própria e um título em cima (ex.: "Kg", "Reps").
 * "typing": os campos para digitar, que ficam sempre montados sobre a faixa (invisíveis fora do
 * modo digitar), porque o iPhone só abre o teclado se o campo receber o foco dentro do próprio toque.
 */
export function WheelGroup({ head, size = 1, typing, children }: { head?: string; size?: number; typing?: ReactNode; children: ReactNode }) {
  return (
    <div className="wheel-group" style={{ flex: size }}>
      {head && <span className="wheel-head">{head}</span>}
      <div className="wheel-row">
        <div className="wheels-band" aria-hidden="true" />
        {children}
        {typing && <div className="wheel-typing">{typing}</div>}
      </div>
    </div>
  );
}

/** Coloca o cursor no campo (dentro do toque, para o teclado abrir) com o texto todo selecionado. */
export function focusField(el: HTMLInputElement | null): void {
  if (!el) return;
  el.focus();
  el.select();
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
  // Onde as roletas começam (muda ao voltar do modo digitar).
  const [at, setAt] = useState(initial);
  const [typing, setTyping] = useState(false);
  const [round, setRound] = useState(0);
  const minIn = useRef<HTMLInputElement>(null);
  const secIn = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    min.current = Math.floor(initial / 60);
    sec.current = initial % 60;
    setAt(initial);
    setTyping(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tocar no número escolhido (com tracejado) passa a digitar minutos e segundos.
  const startTyping = (target: RefObject<HTMLInputElement | null>) => {
    if (minIn.current) minIn.current.value = String(min.current);
    if (secIn.current) secIn.current.value = String(sec.current).padStart(2, '0');
    focusField(target.current);
    setTyping(true);
  };
  const typed = (): number => {
    const m = Number.parseInt(minIn.current?.value ?? '', 10);
    const s = Number.parseInt(secIn.current?.value ?? '', 10);
    const mm = Number.isFinite(m) ? Math.max(0, Math.min(MAX_MIN, m)) : min.current;
    const ss = Number.isFinite(s) ? Math.max(0, Math.min(59, s)) : sec.current;
    return mm * 60 + ss;
  };
  const backToWheels = () => {
    const t = typed();
    min.current = Math.floor(t / 60);
    sec.current = t % 60;
    setAt(t);
    setRound((r) => r + 1);
    setTyping(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const done = () => onDone((typing ? typed() : min.current * 60 + sec.current) || null);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') done();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {typing && (
        <button type="button" className="text-btn wheel-back" onClick={backToWheels}>
          ‹ Voltar para a roleta
        </button>
      )}
      <div key={round} className={`wheels ${typing ? 'typing' : ''}`} aria-label="Escolher minutos e segundos">
        <WheelGroup
          typing={
            <>
              <input ref={minIn} className="wheel-field short" inputMode="numeric" enterKeyHint="done" aria-label="Minutos" onKeyDown={onKey} />
              <span className="u">min</span>
              <input ref={secIn} className="wheel-field short" inputMode="numeric" enterKeyHint="done" aria-label="Segundos" onKeyDown={onKey} />
              <span className="u">seg</span>
            </>
          }
        >
          <Wheel values={MINUTES} index={Math.floor(at / 60)} unit="min" label="Minutos" onChange={(i) => (min.current = MINUTES[i])} onTapCurrent={() => startTyping(minIn)} />
          <Wheel values={SECONDS} index={at % 60} unit="seg" label="Segundos" onChange={(i) => (sec.current = i)} onTapCurrent={() => startTyping(secIn)} />
        </WheelGroup>
      </div>
      <div className="stack">
        <button type="button" className="btn big block primary" onClick={done}>
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
