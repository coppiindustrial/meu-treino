import { db } from './db';
import type { DoneSet, LoadUnit, Session, SessionItem } from './types';

export interface HistoryPoint {
  sessionId: string;
  date: string;
  startedAt: number | null;
  unit: LoadUnit;
  best: number | null;
  bestReps: number | null;
  sets: DoneSet[];
}

/** Melhor série: maior carga entre as séries normais/até a falha feitas. */
export function bestSet(sets: DoneSet[]): { load: number | null; reps: number | null } {
  const work = sets.filter((s) => s.done && (s.type === 'N' || s.type === 'F'));
  const pool = work.length ? work : sets.filter((s) => s.done && s.type !== 'A');
  let best: DoneSet | undefined;
  for (const s of pool) {
    if (s.load === null || s.load === undefined) continue;
    if (!best || s.load > (best.load ?? 0) || (s.load === best.load && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  if (!best) {
    const reps = pool.reduce((m, s) => Math.max(m, s.reps ?? 0), 0);
    return { load: null, reps: reps || null };
  }
  return { load: best.load, reps: best.reps };
}

/** Volume em kg (carga × repetições), ignorando aquecimento. Placas não entram. */
export function volumeKg(sets: DoneSet[], unit: LoadUnit): number {
  if (unit === 'placa') return 0;
  const factor = unit === 'lb' ? 0.4536 : 1;
  return sets
    .filter((s) => s.done && s.type !== 'A')
    .reduce((sum, s) => sum + (s.load ?? 0) * (s.reps ?? 0) * factor, 0);
}

function sortKey(s: Pick<Session, 'date' | 'startedAt'>): string {
  return `${s.date}|${String(s.startedAt ?? 0).padStart(15, '0')}`;
}

/** Histórico de um exercício, do mais antigo para o mais recente (só treinos concluídos). */
export async function exerciseHistory(exerciseId: string): Promise<HistoryPoint[]> {
  const items = await db.sessionItems.where('exerciseId').equals(exerciseId).filter((i) => !i.deleted).toArray();
  if (items.length === 0) return [];
  const sessions = await db.sessions.bulkGet([...new Set(items.map((i) => i.sessionId))]);
  const map = new Map(sessions.filter((s): s is Session => !!s && !s.deleted).map((s) => [s.id, s]));
  const points: (HistoryPoint & { key: string })[] = [];
  for (const it of items) {
    const s = map.get(it.sessionId);
    if (!s || s.status !== 'done') continue;
    if (!it.sets.some((x) => x.done)) continue;
    const b = bestSet(it.sets);
    points.push({
      key: sortKey(s),
      sessionId: s.id,
      date: s.date,
      startedAt: s.startedAt,
      unit: it.unit ?? 'kg',
      best: b.load,
      bestReps: b.reps,
      sets: it.sets.filter((x) => x.done),
    });
  }
  return points.sort((a, b) => (a.key < b.key ? -1 : 1)).map(({ key: _k, ...p }) => p);
}

/** Treinos concluídos, do mais recente para o mais antigo. */
export async function doneSessions(): Promise<Session[]> {
  const list = await db.sessions.filter((s) => !s.deleted && s.status === 'done').toArray();
  return list.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
}

export function summarize(items: SessionItem[]): { exercisesDone: number; setsDone: number; volume: number } {
  let setsDone = 0;
  let volume = 0;
  let exercisesDone = 0;
  for (const it of items) {
    const done = it.sets.filter((s) => s.done).length;
    setsDone += done;
    volume += volumeKg(it.sets, it.unit ?? 'kg');
    if (it.done || done > 0) exercisesDone += 1;
  }
  return { exercisesDone, setsDone, volume: Math.round(volume) };
}

export interface RecordHit {
  exerciseId: string;
  load: number;
  reps: number | null;
  unit: LoadUnit;
  previous: number;
}

/** Recordes batidos num treino (comparando com os treinos anteriores do mesmo exercício). */
export async function sessionRecords(session: Session, items: SessionItem[]): Promise<RecordHit[]> {
  const hits: RecordHit[] = [];
  const key = sortKey(session);
  for (const it of items) {
    const b = bestSet(it.sets);
    if (b.load === null) continue;
    const history = await exerciseHistory(it.exerciseId);
    let previous: number | null = null;
    for (const p of history) {
      if (p.sessionId === session.id) continue;
      if (sortKey(p) >= key) continue;
      if (p.unit !== (it.unit ?? 'kg') || p.best === null) continue;
      previous = previous === null ? p.best : Math.max(previous, p.best);
    }
    if (previous !== null && b.load > previous) {
      hits.push({ exerciseId: it.exerciseId, load: b.load, reps: b.reps, unit: it.unit ?? 'kg', previous });
    }
  }
  return hits;
}
