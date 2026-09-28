import type { EquipmentId, LoadUnit, SetType } from './types';

export const EQUIPMENT: { id: EquipmentId; name: string }[] = [
  { id: 'barra', name: 'Barra' },
  { id: 'halter', name: 'Halter' },
  { id: 'maquina', name: 'Máquina' },
  { id: 'polia', name: 'Polia' },
  { id: 'smith', name: 'Smith' },
  { id: 'peso_corpo', name: 'Peso do corpo' },
  { id: 'kettlebell', name: 'Kettlebell' },
  { id: 'elastico', name: 'Elástico' },
  { id: 'outro', name: 'Outro' },
];

export function equipmentName(id: EquipmentId): string {
  return EQUIPMENT.find((e) => e.id === id)?.name ?? id;
}

export const UNITS: { id: LoadUnit; name: string; short: string }[] = [
  { id: 'kg', name: 'kg', short: 'kg' },
  { id: 'lb', name: 'lb', short: 'lb' },
  { id: 'placa', name: 'Nº da placa', short: 'placa' },
];

export function loadText(load: number | null | undefined, unit: LoadUnit): string {
  if (load === null || load === undefined) return '';
  const n = load.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return unit === 'placa' ? `placa ${n}` : `${n} ${unit}`;
}

export interface SetTypeInfo {
  id: SetType;
  letter: string;
  name: string;
  desc: string;
  className: string;
}

export const SET_TYPES: SetTypeInfo[] = [
  { id: 'A', letter: 'A', name: 'Aquecimento', desc: 'Leve, só para preparar. Não conta no progresso.', className: 'st-a' },
  { id: 'N', letter: '1', name: 'Normal', desc: 'Série de trabalho. Conta no progresso.', className: 'st-n' },
  { id: 'F', letter: 'F', name: 'Até a falha', desc: 'Até não conseguir fazer mais nenhuma repetição.', className: 'st-f' },
  { id: 'D', letter: 'D', name: 'Drop-set', desc: 'Reduz a carga e continua sem descansar.', className: 'st-d' },
];

export const SET_TYPE_BY_ID = Object.fromEntries(SET_TYPES.map((t) => [t.id, t])) as Record<
  SetType,
  SetTypeInfo
>;

/** Rótulos das séries: aquecimento = A, normais numeradas, falha = F, drop = D. */
export function setLabels(types: SetType[]): string[] {
  let n = 0;
  return types.map((t) => {
    if (t === 'N') {
      n += 1;
      return String(n);
    }
    return SET_TYPE_BY_ID[t].letter;
  });
}
