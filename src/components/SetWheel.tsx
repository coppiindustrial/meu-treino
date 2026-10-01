import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { num, parseNum } from '../lib/format';
import type { LoadUnit } from '../lib/types';
import { focusField, range, Wheel, WheelGroup, WheelSep } from './DurationWheel';
import { Sheet } from './Sheet';

const KG = range(0, 500);
const LB = range(0, 700);
const PLATES = range(1, 25);
const REPS = range(1, 50);
const DEC = ['00', '25', '50', '75'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Posição nas roletas de inteiro e casas (",00 ,25 ,50 ,75") para um peso. */
function loadIndexes(v: number, max: number): [number, number] {
  let int = Math.floor(v);
  let dec = Math.round((v - int) * 4);
  if (dec === 4) {
    int += 1;
    dec = 0;
  }
  return [clamp(int, 0, max), dec];
}

/** Texto do peso no campo: "22,5", "22,25" (placa sem casas). */
export const loadText = (v: number | null | undefined): string => (v === null || v === undefined ? '' : num(v, 2));

/** Peso digitado, no passo da roleta: kg/lb de 0,25 em 0,25 (20,85 → 20,75); placa inteira de 1 a 25. */
function typedLoad(text: string, placa: boolean): number | null {
  const v = parseNum(text);
  if (v === null) return null;
  return placa ? clamp(Math.round(v), 1, PLATES.length) : Math.max(0, Math.round(v * 4) / 4);
}

function typedReps(text: string): number | null {
  const v = parseNum(text);
  return v === null ? null : clamp(Math.round(v), 1, 999);
}

interface Pick {
  int: number;
  dec: number;
  plate: number;
  a: number;
  b: number;
}

/**
 * Janela de roletas de uma série (como no BeFit): carga à esquerda (kg/lb com casas, ou nº da placa)
 * e repetições à direita (uma roleta, ou "de – até" na faixa de repetições do Editar).
 * Tocar no número escolhido (o com tracejado) passa a digitar; o ‹ volta para a roleta.
 */
export function SetWheelSheet({
  onClose,
  title,
  subtitle,
  unit,
  load,
  loadStart,
  reps,
  range: isRange,
  canClear,
  onSave,
  onClear,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  unit: LoadUnit;
  /** Carga atual da série (null = vazia). */
  load: number | null;
  /** Onde a roleta de carga começa quando a série está vazia (a sugestão em cinza). */
  loadStart: number | null;
  /** Repetições onde as roletas começam: [fixa] ou [de, até]. */
  reps: [number, number?];
  range: boolean;
  canClear: boolean;
  onSave: (load: number | null, reps: [number, number?]) => void;
  onClear: () => void;
}) {
  const placa = unit === 'placa';
  const ints = unit === 'lb' ? LB : KG;
  const [initial] = useState<Pick>(() => {
    const startLoad = load ?? loadStart ?? (placa ? 1 : 0);
    const [int, dec] = loadIndexes(startLoad, ints.length - 1);
    return {
      int,
      dec,
      plate: clamp(Math.round(startLoad) - 1, 0, PLATES.length - 1),
      a: clamp(reps[0] - 1, 0, REPS.length - 1),
      b: clamp((reps[1] ?? reps[0]) - 1, 0, REPS.length - 1),
    };
  });
  // Onde as roletas começam (muda ao voltar do modo digitar) e o que está escolhido nelas agora.
  const [start, setStart] = useState<Pick>(initial);
  const pick = useRef<Pick>({ ...initial });
  const [typing, setTyping] = useState(false);
  const [round, setRound] = useState(0); // remonta as roletas na posição nova ao voltar do modo digitar
  const loadIn = useRef<HTMLInputElement>(null);
  const repAIn = useRef<HTMLInputElement>(null);
  const repBIn = useRef<HTMLInputElement>(null);

  /** Carga escolhida na roleta. Sem mexer nela, fica o valor que já estava (ex.: 22,3 kg de uma importação). */
  const wheelLoad = () => {
    const p = pick.current;
    const untouched = placa ? p.plate === initial.plate : p.int === initial.int && p.dec === initial.dec;
    if (untouched && load !== null) return load;
    return placa ? PLATES[p.plate] : ints[p.int] + p.dec / 4;
  };

  const startTyping = (target: RefObject<HTMLInputElement | null>) => {
    const p = pick.current;
    if (loadIn.current) loadIn.current.value = loadText(wheelLoad());
    if (repAIn.current) repAIn.current.value = String(REPS[p.a]);
    if (repBIn.current) repBIn.current.value = String(REPS[p.b]);
    focusField(target.current); // ainda dentro do toque: assim o iPhone abre o teclado
    setTyping(true);
  };

  /** Valores digitados (o que estiver vazio ou inválido fica como na roleta). */
  const typed = () => {
    const p = pick.current;
    const l = typedLoad(loadIn.current?.value ?? '', placa) ?? wheelLoad();
    const a = typedReps(repAIn.current?.value ?? '') ?? REPS[p.a];
    const b = typedReps(repBIn.current?.value ?? '') ?? REPS[p.b];
    return { l, a, b };
  };

  const backToWheels = () => {
    const { l, a, b } = typed();
    const [int, dec] = loadIndexes(l, ints.length - 1);
    const next: Pick = {
      int,
      dec,
      plate: clamp(Math.round(l) - 1, 0, PLATES.length - 1),
      a: clamp(a - 1, 0, REPS.length - 1),
      b: clamp(b - 1, 0, REPS.length - 1),
    };
    pick.current = { ...next };
    setStart(next);
    setRound((r) => r + 1);
    setTyping(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const save = () => {
    if (typing) {
      const { l, a, b } = typed();
      onSave(l, isRange ? [Math.min(a, b), Math.max(a, b)] : [a]);
      return;
    }
    const p = pick.current;
    const a = REPS[p.a];
    const b = REPS[p.b];
    onSave(wheelLoad(), isRange ? [Math.min(a, b), Math.max(a, b)] : [a]);
  };

  // No teclado: "OK" salva.
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save();
  };
  // Ao sair do campo, o peso já aparece arredondado como vai ficar (20,85 → 20,75).
  const tidyLoad = () => {
    const el = loadIn.current;
    if (!el) return;
    const v = typedLoad(el.value, placa);
    if (v !== null) el.value = loadText(v);
  };

  const unitLabel = placa ? 'Placa' : unit === 'lb' ? 'Lb' : 'Kg';
  const typeLoad = () => startTyping(loadIn);
  const typeRepA = () => startTyping(repAIn);
  const typeRepB = () => startTyping(repBIn);
  return (
    <Sheet open onClose={onClose} title={title} subtitle={subtitle}>
      {typing && (
        <button type="button" className="text-btn wheel-back" onClick={backToWheels}>
          ‹ Voltar para a roleta
        </button>
      )}
      <div key={round} className={`wheels ${typing ? 'typing' : ''}`}>
        <WheelGroup
          head={unitLabel}
          size={placa ? 1 : 2}
          typing={
            <>
              <input ref={loadIn} className="wheel-field" inputMode={placa ? 'numeric' : 'decimal'} enterKeyHint="done" aria-label={`Carga em ${unit}`} onKeyDown={onKey} onBlur={tidyLoad} />
              <span className="u">{placa ? 'placa' : unit}</span>
            </>
          }
        >
          {placa ? (
            <Wheel values={PLATES} index={start.plate} unit="placa" label="Número da placa" onChange={(i) => (pick.current.plate = i)} onTapCurrent={typeLoad} />
          ) : (
            <>
              <Wheel values={ints} index={start.int} label={`Carga em ${unit}`} onChange={(i) => (pick.current.int = i)} onTapCurrent={typeLoad} />
              <WheelSep>,</WheelSep>
              <Wheel values={DEC} index={start.dec} unit={unit} label="Casas da carga" onChange={(i) => (pick.current.dec = i)} onTapCurrent={typeLoad} />
            </>
          )}
        </WheelGroup>
        <WheelGroup
          head="Reps"
          size={isRange ? 2 : 1}
          typing={
            isRange ? (
              <>
                <input ref={repAIn} className="wheel-field short" inputMode="numeric" enterKeyHint="done" aria-label="Repetições, mínimo" onKeyDown={onKey} />
                <span className="sep">–</span>
                <input ref={repBIn} className="wheel-field short" inputMode="numeric" enterKeyHint="done" aria-label="Repetições, máximo" onKeyDown={onKey} />
              </>
            ) : (
              <input ref={repAIn} className="wheel-field short" inputMode="numeric" enterKeyHint="done" aria-label="Repetições" onKeyDown={onKey} />
            )
          }
        >
          {isRange ? (
            <>
              <Wheel values={REPS} index={start.a} label="Repetições, mínimo" onChange={(i) => (pick.current.a = i)} onTapCurrent={typeRepA} />
              <WheelSep>–</WheelSep>
              <Wheel values={REPS} index={start.b} label="Repetições, máximo" onChange={(i) => (pick.current.b = i)} onTapCurrent={typeRepB} />
            </>
          ) : (
            <Wheel values={REPS} index={start.a} unit="reps" label="Repetições" onChange={(i) => (pick.current.a = i)} onTapCurrent={typeRepA} />
          )}
        </WheelGroup>
      </div>
      <div className="stack">
        <button type="button" className="btn big block primary" onClick={save}>
          Salvar
        </button>
        {canClear && (
          <button type="button" className="btn big block soft" onClick={onClear}>
            Limpar
          </button>
        )}
      </div>
    </Sheet>
  );
}
