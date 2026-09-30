import { num, parseNum } from './format';
import type { DistUnit, DoneSet, IntervalConfig, LogType, MuscleId } from './types';

/** Exercícios que se registram só por tempo (sem distância). */
const TIME_ONLY = new Set(['pular-corda', 'polichinelo', 'escalador', 'prancha', 'prancha-lateral', 'corda-naval']);

/** Como registrar o exercício quando o usuário ainda não escolheu. */
export function defaultLogType(exerciseId: string, primary: MuscleId): LogType {
  if (TIME_ONLY.has(exerciseId)) return 'tempo';
  if (primary === 'cardio') return 'tempo_km';
  return 'carga';
}

export const DEFAULT_INTERVAL: IntervalConfig = { work: 120, rest: 60, rounds: 6 };

export const LOG_TYPES: { id: LogType; name: string; desc: string }[] = [
  { id: 'carga', name: 'Carga e reps', desc: 'kg e repetições' },
  { id: 'tempo', name: 'Só tempo', desc: 'só a duração (prancha, corda)' },
  { id: 'tempo_km', name: 'Tempo e km', desc: 'distância e duração' },
  { id: 'tiros', name: 'Tiros', desc: 'tiro, descanso e rodadas com timer' },
];

export function logTypeName(t: LogType): string {
  return LOG_TYPES.find((x) => x.id === t)?.name ?? 'Carga e reps';
}

export const isCardio = (t: LogType | undefined): boolean => t === 'tempo' || t === 'tempo_km' || t === 'tiros';

/**
 * Lê um tempo digitado: "1:30" = 1 min 30 s; só números contam os dois últimos dígitos como
 * segundos ("130" = 1:30, "45" = 0:45, "3000" = 30:00). "1:05:00" = 1 h 5 min.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p.replace(/\D/g, '') || '0'));
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 2) return Number(digits);
  return Number(digits.slice(0, -2)) * 60 + Number(digits.slice(-2));
}

/** 90 → "1:30"; 3900 → "1:05:00". */
export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return '';
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function parseDistance(text: string, unit: DistUnit): number | null {
  const v = parseNum(text);
  if (v === null) return null;
  return unit === 'm' ? Math.round(v) : v;
}

export function distText(dist: number | null | undefined, unit: DistUnit): string {
  if (dist === null || dist === undefined) return '';
  return unit === 'm' ? `${Math.round(dist)} m` : `${num(dist, 2)} km`;
}

export function toKm(dist: number | null | undefined, unit: DistUnit): number {
  if (!dist) return 0;
  return unit === 'm' ? dist / 1000 : dist;
}

/** Ritmo em segundos por km (null quando não dá para calcular). */
export function paceSecsPerKm(secs: number, km: number): number | null {
  if (!secs || !km) return null;
  return secs / km;
}

/** Totais de cardio das séries feitas (aquecimento conta junto). */
export function cardioTotals(sets: DoneSet[], unit: DistUnit): { secs: number; km: number } {
  let secs = 0;
  let km = 0;
  for (const s of sets) {
    if (!s.done) continue;
    secs += s.secs ?? 0;
    km += toKm(s.dist, unit);
  }
  return { secs, km };
}

/** Texto curto de uma série de cardio: "9,4 km · 30:00" ou "1:00". */
export function cardioSetText(s: Pick<DoneSet, 'secs' | 'dist'>, unit: DistUnit): string {
  return [distText(s.dist, unit), formatDuration(s.secs)].filter(Boolean).join(' · ') || '—';
}
