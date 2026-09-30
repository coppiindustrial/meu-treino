import { DEFAULT_INTERVAL, distText, formatDuration } from './cardio';
import { loadText } from './equipment';
import type { DistUnit, IntervalConfig, LoadUnit, LogType, PlannedSet } from './types';

/** "8-12" → "8–12" (faixa com travessão). */
export function repsText(reps: string): string {
  return reps.replace('-', '–');
}

export function plannedSummary(sets: PlannedSet[], unit: LoadUnit): string {
  const work = sets.filter((s) => s.type !== 'A');
  const warm = sets.length - work.length;
  if (sets.length === 0) return 'Sem séries';
  const reps = [...new Set(work.map((s) => s.reps).filter(Boolean))].map(repsText);
  const loads = work.map((s) => s.load).filter((l): l is number => l !== null);
  let text = `${work.length} × ${reps.length === 0 ? '—' : reps.join('/')}`;
  if (loads.length) text += ` · ${loadText(Math.max(...loads), unit)}`;
  if (warm) text += ` · ${warm} aquec.`;
  return text;
}

/** Resumo de um exercício da rotina, entendendo cardio (tempo, km e tiros). */
export function itemSummary(
  item: { sets: PlannedSet[]; logType?: LogType; distUnit?: DistUnit; interval?: IntervalConfig },
  fallback: LogType,
  unit: LoadUnit,
): string {
  const logType = item.logType ?? fallback;
  if (logType === 'carga') return plannedSummary(item.sets, unit);
  if (logType === 'tiros') {
    const c = item.interval ?? DEFAULT_INTERVAL;
    return `Tiros ${c.rounds} × ${formatDuration(c.work)}${c.rest ? ` · descanso ${formatDuration(c.rest)}` : ''}`;
  }
  if (item.sets.length === 0) return 'Sem séries';
  const first = item.sets[0];
  const parts = [logType === 'tempo_km' ? distText(first.dist, item.distUnit ?? 'km') : '', formatDuration(first.secs)].filter(Boolean);
  return `${item.sets.length} × ${parts.join(' · ') || '—'}`;
}

/** "8-12" → 10 (meio da faixa); "10" → 10. */
function repsValue(reps: string): number {
  const [a, b] = reps.split('-').map((x) => Number(x.trim()));
  if (!Number.isFinite(a) || a <= 0) return 0;
  return Number.isFinite(b) && b > 0 ? (a + b) / 2 : a;
}

/**
 * Volume previsto em kg de uma rotina (carga × repetições das séries planejadas, sem aquecimento),
 * nas mesmas regras do volume do treino feito: lb vira kg; placas e cardio não entram.
 */
export function plannedVolumeKg(items: { sets: PlannedSet[]; logType?: LogType }[], exerciseOf: (i: number) => { logType: LogType; unit: LoadUnit }): number {
  let total = 0;
  items.forEach((it, i) => {
    const ex = exerciseOf(i);
    if ((it.logType ?? ex.logType) !== 'carga' || ex.unit === 'placa') return;
    const factor = ex.unit === 'lb' ? 0.4536 : 1;
    for (const s of it.sets) if (s.type !== 'A' && s.load) total += s.load * repsValue(s.reps) * factor;
  });
  return Math.round(total);
}

/** Quantas séries a rotina tem (os tiros contam cada tiro). */
export function plannedSetCount(items: { sets: PlannedSet[]; logType?: LogType; interval?: IntervalConfig }[], logTypeOf: (i: number) => LogType): number {
  return items.reduce((sum, it, i) => sum + ((it.logType ?? logTypeOf(i)) === 'tiros' ? (it.interval ?? DEFAULT_INTERVAL).rounds : it.sets.length), 0);
}

/** Agrupa itens consecutivos ligados em superset. */
export function groupSupersets<T extends { supersetNext: boolean }>(items: T[]): T[][] {
  const groups: T[][] = [];
  items.forEach((it, i) => {
    if (i === 0 || !items[i - 1].supersetNext) groups.push([]);
    groups[groups.length - 1].push(it);
  });
  return groups;
}

export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

/** 90 → "1min 30s", 0 → "Desligado" */
export function restText(seconds: number): string {
  if (!seconds) return 'Desligado';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
}
