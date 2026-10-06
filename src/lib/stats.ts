import { cardioTotals, isCardio } from './cardio';
import { db } from './db';
import type { DistUnit, DoneSet, LoadUnit, LogType, Session, SessionItem } from './types';

export interface HistoryPoint {
  sessionId: string;
  itemId: string;
  /** Nome do treino (ex.: "A · Peito e Tríceps"). */
  title: string;
  /** O exercício entrou durante o treino, fora da ficha. */
  extra: boolean;
  date: string;
  startedAt: number | null;
  unit: LoadUnit;
  best: number | null;
  bestReps: number | null;
  sets: DoneSet[];
  logType?: LogType;
  distUnit: DistUnit;
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

/** Volume dos exercícios anotados em placa: nº da placa × repetições, ignorando aquecimento. Não soma com kg. */
export function volumePlates(sets: DoneSet[], unit: LoadUnit): number {
  if (unit !== 'placa') return 0;
  return sets.filter((s) => s.done && s.type !== 'A').reduce((sum, s) => sum + (s.load ?? 0) * (s.reps ?? 0), 0);
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
      itemId: it.id,
      title: s.title,
      extra: !!it.extra,
      date: s.date,
      startedAt: s.startedAt,
      unit: it.unit ?? 'kg',
      best: b.load,
      bestReps: b.reps,
      sets: it.sets.filter((x) => x.done),
      logType: it.logType,
      distUnit: it.distUnit ?? 'km',
    });
  }
  return points.sort((a, b) => (a.key < b.key ? -1 : 1)).map(({ key: _k, ...p }) => p);
}

/** Treinos concluídos, do mais recente para o mais antigo. */
export async function doneSessions(): Promise<Session[]> {
  const list = await db.sessions.filter((s) => !s.deleted && s.status === 'done').toArray();
  return list.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
}

export interface SessionStats {
  exercisesDone: number;
  /** Exercícios feitos que vieram da ficha e que entraram durante o treino. */
  planExercises: number;
  extraExercises: number;
  /** Séries de trabalho feitas (sem aquecimento). */
  setsDone: number;
  warmupsDone: number;
  /** Volume em kg e quantos exercícios entraram nele. */
  volume: number;
  volumeExercises: number;
  /** Volume em placas (nº da placa × reps) e quantos exercícios entraram nele. */
  plateVolume: number;
  plateExercises: number;
  km: number;
  cardioSecs: number;
}

export function summarize(items: SessionItem[]): SessionStats {
  const st: SessionStats = {
    exercisesDone: 0,
    planExercises: 0,
    extraExercises: 0,
    setsDone: 0,
    warmupsDone: 0,
    volume: 0,
    volumeExercises: 0,
    plateVolume: 0,
    plateExercises: 0,
    km: 0,
    cardioSecs: 0,
  };
  for (const it of items) {
    const done = it.sets.filter((s) => s.done);
    const warmups = done.filter((s) => s.type === 'A').length;
    st.setsDone += done.length - warmups;
    st.warmupsDone += warmups;
    const unit = it.unit ?? 'kg';
    const kg = isCardio(it.logType) ? 0 : volumeKg(it.sets, unit);
    const plates = isCardio(it.logType) ? 0 : volumePlates(it.sets, unit);
    st.volume += kg;
    st.plateVolume += plates;
    if (kg > 0) st.volumeExercises += 1;
    if (plates > 0) st.plateExercises += 1;
    const c = cardioTotals(it.sets, it.distUnit ?? 'km');
    st.km += c.km;
    st.cardioSecs += c.secs;
    if (it.done || done.length > 0) {
      st.exercisesDone += 1;
      if (it.extra) st.extraExercises += 1;
      else st.planExercises += 1;
    }
  }
  st.volume = Math.round(st.volume);
  st.plateVolume = Math.round(st.plateVolume);
  return st;
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
