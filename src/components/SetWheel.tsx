import { useRef } from 'react';
import { num } from '../lib/format';
import type { LoadUnit } from '../lib/types';
import { range, Wheel, WheelGroup, WheelSep } from './DurationWheel';
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

/**
 * Janela de roletas de uma série (como no BeFit): carga à esquerda (kg/lb com casas, ou nº da placa)
 * e repetições à direita (uma roleta, ou "de – até" na faixa de repetições do Editar).
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
  const startLoad = load ?? loadStart ?? (placa ? 1 : 0);
  const [i0, d0] = loadIndexes(startLoad, ints.length - 1);
  const p0 = clamp(Math.round(startLoad) - 1, 0, PLATES.length - 1);
  const r0 = clamp(reps[0] - 1, 0, REPS.length - 1);
  const r1 = clamp((reps[1] ?? reps[0]) - 1, 0, REPS.length - 1);
  const pick = useRef({ int: i0, dec: d0, plate: p0, a: r0, b: r1 });

  const save = () => {
    const p = pick.current;
    // Sem mexer na carga, fica o valor que já estava (ex.: 22,3 kg vindo de uma importação).
    const untouched = placa ? p.plate === p0 : p.int === i0 && p.dec === d0;
    const value = untouched && load !== null ? load : placa ? PLATES[p.plate] : ints[p.int] + p.dec / 4;
    const a = REPS[p.a];
    const b = REPS[p.b];
    onSave(value, isRange ? [Math.min(a, b), Math.max(a, b)] : [a]);
  };

  const unitLabel = placa ? 'Placa' : unit === 'lb' ? 'Lb' : 'Kg';
  return (
    <Sheet open onClose={onClose} title={title} subtitle={subtitle}>
      <div className="wheels">
        <WheelGroup head={unitLabel} size={placa ? 1 : 2}>
          {placa ? (
            <Wheel values={PLATES} index={p0} unit="placa" label="Número da placa" onChange={(i) => (pick.current.plate = i)} />
          ) : (
            <>
              <Wheel values={ints} index={i0} label={`Carga em ${unit}`} onChange={(i) => (pick.current.int = i)} />
              <WheelSep>,</WheelSep>
              <Wheel values={DEC} index={d0} unit={unit} label="Casas da carga" onChange={(i) => (pick.current.dec = i)} />
            </>
          )}
        </WheelGroup>
        <WheelGroup head="Reps" size={isRange ? 2 : 1}>
          {isRange ? (
            <>
              <Wheel values={REPS} index={r0} label="Repetições, mínimo" onChange={(i) => (pick.current.a = i)} />
              <WheelSep>–</WheelSep>
              <Wheel values={REPS} index={r1} label="Repetições, máximo" onChange={(i) => (pick.current.b = i)} />
            </>
          ) : (
            <Wheel values={REPS} index={r0} unit="reps" label="Repetições" onChange={(i) => (pick.current.a = i)} />
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
