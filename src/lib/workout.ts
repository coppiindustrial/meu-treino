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
