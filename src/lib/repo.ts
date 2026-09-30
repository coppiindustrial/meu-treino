import { db, tableOf, type SyncedTableName } from './db';
import { DEFAULT_INTERVAL, isCardio } from './cardio';
import { exerciseLog, exerciseUnit } from './exercises';
import { todayISO } from './format';
import { newId } from './ids';
import { scheduleSync } from './sync';
import type {
  BodyEntry,
  CustomExercise,
  DistUnit,
  DoneSet,
  ExercisePref,
  LoadUnit,
  LogType,
  PlannedSet,
  Profile,
  Program,
  RepMode,
  Session,
  SessionItem,
  SetType,
  Synced,
  Workout,
  WorkoutItem,
} from './types';

export const alive = <T extends { deleted?: 0 | 1 }>(r: T | undefined): r is T => !!r && !r.deleted;

function stamp<T extends object>(row: T): T & { updatedAt: number; dirty: 1 } {
  return { ...row, updatedAt: Date.now(), dirty: 1 };
}

async function put<T extends Synced>(name: SyncedTableName, row: T): Promise<void> {
  await tableOf(name).put(stamp(row));
  scheduleSync();
}

async function putMany<T extends Synced>(name: SyncedTableName, rows: T[]): Promise<void> {
  if (rows.length === 0) return;
  await tableOf(name).bulkPut(rows.map(stamp));
  scheduleSync();
}

async function patch(name: SyncedTableName, id: string, changes: object): Promise<void> {
  await tableOf(name).update(id, { ...changes, updatedAt: Date.now(), dirty: 1 });
  scheduleSync();
}

async function softDelete(name: SyncedTableName, id: string): Promise<void> {
  await patch(name, id, { deleted: 1 });
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

// ---------------------------------------------------------------- Perfil

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  name: '',
  heightCm: null,
  goal: 'Hipertrofia',
  weeklyGoal: 4,
  restSeconds: 90,
  updatedAt: 0,
};

export async function getProfile(): Promise<Profile> {
  const p = await db.profile.get('me');
  return p && !p.deleted ? { ...DEFAULT_PROFILE, ...p } : DEFAULT_PROFILE;
}

export async function saveProfile(changes: Partial<Profile>): Promise<void> {
  const current = await getProfile();
  await put('profile', { ...current, ...changes, id: 'me' });
}

// ---------------------------------------------------------------- Fichas

export async function getActiveProgram(): Promise<Program | undefined> {
  return db.programs.filter((p) => !p.deleted && p.status === 'active').first();
}

export async function createProgram(name: string): Promise<string> {
  const hasActive = (await getActiveProgram()) !== undefined;
  const now = Date.now();
  const id = newId();
  await put<Program>('programs', {
    id,
    name: name.trim() || 'Minha rotina',
    status: hasActive ? 'ready' : 'active',
    createdAt: now,
    startedAt: hasActive ? null : now,
    endedAt: null,
    updatedAt: now,
  });
  return id;
}

export async function renameProgram(id: string, name: string): Promise<void> {
  await patch('programs', id, { name: name.trim() || 'Minha rotina' });
}

export async function activateProgram(id: string): Promise<void> {
  const now = Date.now();
  const actives = await db.programs.filter((p) => !p.deleted && p.status === 'active' && p.id !== id).toArray();
  for (const p of actives) await patch('programs', p.id, { status: 'archived', endedAt: now });
  await patch('programs', id, { status: 'active', startedAt: now, endedAt: null });
}

export async function archiveProgram(id: string): Promise<void> {
  await patch('programs', id, { status: 'archived', endedAt: Date.now() });
}

export async function deleteProgram(id: string): Promise<void> {
  const workouts = await workoutsOf(id);
  for (const w of workouts) await deleteWorkout(w.id, false);
  await softDelete('programs', id);
}

export async function duplicateProgram(id: string): Promise<string> {
  const source = await db.programs.get(id);
  const now = Date.now();
  const newProgramId = newId();
  await put<Program>('programs', {
    id: newProgramId,
    name: `${source?.name ?? 'Rotina'} (cópia)`,
    status: 'ready',
    createdAt: now,
    startedAt: null,
    endedAt: null,
    updatedAt: now,
  });
  for (const w of await workoutsOf(id)) {
    const newWorkoutId = newId();
    await put<Workout>('workouts', { ...w, id: newWorkoutId, programId: newProgramId, deleted: 0 });
    const items = await itemsOf(w.id);
    await putMany<WorkoutItem>(
      'workoutItems',
      items.map((it) => ({ ...it, id: newId(), workoutId: newWorkoutId, deleted: 0 })),
    );
  }
  return newProgramId;
}

export interface ImportDay {
  name: string;
  items: { exerciseId: string; sets: PlannedSet[]; repMode: RepMode; note: string }[];
}

/** Cria uma ficha inteira de uma vez (usado ao colar um treino pronto). */
export async function importProgram(name: string, days: ImportDay[]): Promise<string> {
  const programId = await createProgram(name);
  for (const day of days) {
    const workoutId = await createWorkout(programId, day.name.trim() || 'Novo treino');
    const now = Date.now();
    await putMany<WorkoutItem>(
      'workoutItems',
      day.items.map((it, i) => ({
        id: newId(),
        workoutId,
        exerciseId: it.exerciseId,
        position: i,
        supersetNext: false,
        sets: it.sets,
        note: it.note,
        repMode: it.repMode,
        restSeconds: null,
        updatedAt: now,
      })),
    );
  }
  return programId;
}

// ---------------------------------------------------------------- Treinos

export async function workoutsOf(programId: string): Promise<Workout[]> {
  const list = await db.workouts.where('programId').equals(programId).filter((w) => !w.deleted).toArray();
  return list.sort(byPosition);
}

function nextLetter(existing: Workout[]): string {
  const used = new Set(existing.map((w) => w.letter));
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(l)) return l;
  return String(existing.length + 1);
}

export async function createWorkout(programId: string, name = 'Novo treino'): Promise<string> {
  const list = await workoutsOf(programId);
  const profile = await getProfile();
  const id = newId();
  await put<Workout>('workouts', {
    id,
    programId,
    letter: nextLetter(list),
    name,
    position: list.length,
    restSeconds: profile.restSeconds,
    updatedAt: Date.now(),
  });
  return id;
}

export async function duplicateWorkout(id: string): Promise<string> {
  const source = await db.workouts.get(id);
  if (!source) throw new Error('Treino não encontrado');
  const list = await workoutsOf(source.programId);
  const newWorkoutId = newId();
  await put<Workout>('workouts', {
    ...source,
    id: newWorkoutId,
    letter: nextLetter(list),
    name: `${source.name} (cópia)`,
    position: list.length,
    deleted: 0,
  });
  const items = await itemsOf(id);
  await putMany<WorkoutItem>(
    'workoutItems',
    items.map((it) => ({ ...it, id: newId(), workoutId: newWorkoutId, deleted: 0 })),
  );
  return newWorkoutId;
}

/** Foto da rotina antes de editar, para o botão "Cancelar" desfazer tudo. */
export interface WorkoutSnapshot {
  workout: Workout;
  items: WorkoutItem[];
}

export async function snapshotWorkout(id: string): Promise<WorkoutSnapshot | null> {
  const workout = await db.workouts.get(id);
  if (!workout) return null;
  return { workout, items: await itemsOf(id) };
}

export function sameWorkout(a: WorkoutSnapshot, b: WorkoutSnapshot): boolean {
  const pick = (s: WorkoutSnapshot) =>
    JSON.stringify({
      name: s.workout.name,
      letter: s.workout.letter,
      restSeconds: s.workout.restSeconds,
      items: s.items.map((i) => [i.id, i.exerciseId, i.position, i.supersetNext, i.sets, i.note ?? '', i.repMode ?? '', i.restSeconds ?? null]),
    });
  return pick(a) === pick(b);
}

export async function restoreWorkout(snap: WorkoutSnapshot): Promise<void> {
  const keep = new Set(snap.items.map((i) => i.id));
  for (const it of await itemsOf(snap.workout.id)) if (!keep.has(it.id)) await softDelete('workoutItems', it.id);
  await put<Workout>('workouts', { ...snap.workout, deleted: 0 });
  await putMany<WorkoutItem>('workoutItems', snap.items.map((i) => ({ ...i, deleted: 0 })));
}

export async function updateWorkout(
  id: string,
  changes: Partial<Pick<Workout, 'name' | 'letter' | 'restSeconds'>>,
): Promise<void> {
  await patch('workouts', id, changes);
}

export async function deleteWorkout(id: string, renumber = true): Promise<void> {
  const w = await db.workouts.get(id);
  for (const it of await itemsOf(id)) await softDelete('workoutItems', it.id);
  await softDelete('workouts', id);
  if (renumber && w) {
    const rest = await workoutsOf(w.programId);
    for (const [i, x] of rest.entries()) if (x.position !== i) await patch('workouts', x.id, { position: i });
  }
}

// ---------------------------------------------------------------- Exercícios do treino

export async function itemsOf(workoutId: string): Promise<WorkoutItem[]> {
  const list = await db.workoutItems.where('workoutId').equals(workoutId).filter((i) => !i.deleted).toArray();
  return list.sort(byPosition);
}

export function defaultPlannedSets(): PlannedSet[] {
  return [0, 1, 2].map(() => ({ type: 'N' as SetType, reps: '8-12', load: null }));
}

/** Séries iniciais conforme o tipo de registro (cardio começa sem as 3 × 8–12). */
export function plannedSetsFor(logType: LogType): PlannedSet[] {
  if (logType === 'tempo') return [0, 1, 2].map(() => ({ type: 'N' as SetType, reps: '', load: null, secs: 60 }));
  if (logType === 'tempo_km') return [{ type: 'N', reps: '', load: null, secs: null, dist: null }];
  if (logType === 'tiros') return [];
  return defaultPlannedSets();
}

/** Campos de cardio de um item novo: tipo, unidade, descanso desligado e tiros padrão. */
function cardioFields(logType: LogType, distUnit: DistUnit) {
  return {
    logType,
    distUnit,
    restSeconds: logType === 'tempo_km' || logType === 'tiros' ? 0 : null,
    ...(logType === 'tiros' ? { interval: { ...DEFAULT_INTERVAL } } : {}),
  };
}

export async function addExercisesToWorkout(workoutId: string, exerciseIds: string[]): Promise<void> {
  const items = await itemsOf(workoutId);
  const now = Date.now();
  const rows: WorkoutItem[] = [];
  for (const [i, exerciseId] of exerciseIds.entries()) {
    const log = await exerciseLog(exerciseId);
    rows.push({
      id: newId(),
      workoutId,
      exerciseId,
      position: items.length + i,
      supersetNext: false,
      sets: plannedSetsFor(log.logType),
      note: '',
      repMode: 'faixa',
      ...cardioFields(log.logType, log.distUnit),
      updatedAt: now,
    });
  }
  await putMany<WorkoutItem>('workoutItems', rows);
}

/**
 * Muda um campo de uma série planejada e repete o novo valor nas séries seguintes
 * que ainda tinham o valor antigo (ou estavam vazias). Séries mudadas à mão ficam como estão.
 */
export function propagatePlanned(sets: PlannedSet[], index: number, changes: Partial<PlannedSet>): PlannedSet[] {
  const old = sets[index];
  const out = sets.slice();
  out[index] = { ...old, ...changes };
  for (const f of ['reps', 'load', 'secs', 'dist'] as const) {
    if (!(f in changes) || changes[f] === old[f]) continue;
    for (let j = index + 1; j < out.length; j++) {
      const s = out[j];
      if (s.type === 'A') continue;
      const empty = s[f] === null || s[f] === undefined || s[f] === '';
      if (empty || s[f] === old[f]) out[j] = { ...s, [f]: changes[f] } as PlannedSet;
      else break;
    }
  }
  return out;
}

export async function updateWorkoutItem(id: string, changes: Partial<WorkoutItem>): Promise<void> {
  await patch('workoutItems', id, changes);
}

/** Muda as séries planejadas a partir do valor gravado mais recente (evita perder edições feitas em sequência). */
export async function editPlannedSets(id: string, change: (sets: PlannedSet[]) => PlannedSet[]): Promise<void> {
  await db.transaction('rw', db.workoutItems, async () => {
    const item = await db.workoutItems.get(id);
    if (item) await db.workoutItems.update(id, { sets: change(item.sets), updatedAt: Date.now(), dirty: 1 });
  });
  scheduleSync();
}

/** Reescreve posições e garante que o último item não fique "em superset com o próximo". */
async function normalizeItems(workoutId: string, ordered?: WorkoutItem[]): Promise<void> {
  const items = ordered ?? (await itemsOf(workoutId));
  for (const [i, it] of items.entries()) {
    const isLast = i === items.length - 1;
    const changes: Partial<WorkoutItem> = {};
    if (it.position !== i) changes.position = i;
    if (isLast && it.supersetNext) changes.supersetNext = false;
    if (Object.keys(changes).length) await patch('workoutItems', it.id, changes);
  }
}

export async function removeWorkoutItem(id: string): Promise<void> {
  const item = await db.workoutItems.get(id);
  if (!item) return;
  const items = await itemsOf(item.workoutId);
  const idx = items.findIndex((i) => i.id === id);
  // Se o item removido fechava um superset, o anterior deixa de apontar para ele.
  if (idx > 0 && !item.supersetNext && items[idx - 1].supersetNext) {
    await patch('workoutItems', items[idx - 1].id, { supersetNext: false });
  }
  await softDelete('workoutItems', id);
  await normalizeItems(item.workoutId);
}

/**
 * Grava a ordem da tela "Reordenar". Quem ficou de fora sai da rotina; um superset só continua
 * se o exercício de baixo for o mesmo de antes (grupos separados na nova ordem se desfazem).
 */
export async function reorderWorkoutItems(workoutId: string, orderedIds: string[]): Promise<void> {
  const items = await itemsOf(workoutId);
  const byId = new Map(items.map((it) => [it.id, it]));
  const keep = new Set(orderedIds);
  for (const it of items) if (!keep.has(it.id)) await softDelete('workoutItems', it.id);
  const nextBefore = new Map(items.map((it, i) => [it.id, items[i + 1]?.id]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((it): it is WorkoutItem => !!it);
  for (const [i, it] of ordered.entries()) {
    if (it.supersetNext && nextBefore.get(it.id) !== ordered[i + 1]?.id) {
      await patch('workoutItems', it.id, { supersetNext: false });
      ordered[i] = { ...it, supersetNext: false };
    }
  }
  await normalizeItems(workoutId, ordered);
}

/**
 * Troca o exercício de um item da rotina mantendo séries, anotação, descanso e superset.
 * Se o novo exercício anota de outro jeito (ex.: musculação → esteira), as séries mudam de formato.
 */
export async function replaceWorkoutItemExercise(itemId: string, exerciseId: string): Promise<void> {
  const item = await db.workoutItems.get(itemId);
  if (!item) return;
  const oldType = item.logType ?? (await exerciseLog(item.exerciseId)).logType;
  const log = await exerciseLog(exerciseId);
  if (log.logType === oldType) {
    await patch('workoutItems', itemId, { exerciseId });
    return;
  }
  await patch('workoutItems', itemId, { exerciseId, sets: plannedSetsFor(log.logType), ...cardioFields(log.logType, log.distUnit) });
}

export async function toggleSuperset(itemId: string): Promise<void> {
  const item = await db.workoutItems.get(itemId);
  if (item) await patch('workoutItems', itemId, { supersetNext: !item.supersetNext });
}

// ---------------------------------------------------------------- Sessões (treinos feitos)

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('active').filter((s) => !s.deleted).first();
}

export async function sessionItemsOf(sessionId: string): Promise<SessionItem[]> {
  const list = await db.sessionItems.where('sessionId').equals(sessionId).filter((i) => !i.deleted).toArray();
  return list.sort(byPosition);
}

function sessionSortKey(s: Session): string {
  return `${s.date}|${String(s.startedAt ?? 0).padStart(15, '0')}`;
}

/** Último registro feito de um exercício (para mostrar "anterior" e sugerir a carga). */
export async function lastDoneItemFor(exerciseId: string, excludeSessionId?: string): Promise<SessionItem | undefined> {
  const items = await db.sessionItems.where('exerciseId').equals(exerciseId).filter((i) => !i.deleted).toArray();
  if (items.length === 0) return undefined;
  const ids = [...new Set(items.map((i) => i.sessionId))];
  const sessions = await db.sessions.bulkGet(ids);
  const map = new Map(sessions.filter(alive).map((s) => [s.id, s]));
  let best: SessionItem | undefined;
  let bestKey = '';
  for (const it of items) {
    const s = map.get(it.sessionId);
    if (!s || s.status !== 'done' || s.id === excludeSessionId) continue;
    if (!it.sets.some((x) => x.done)) continue;
    const key = sessionSortKey(s);
    if (key > bestKey) {
      bestKey = key;
      best = it;
    }
  }
  return best;
}

function firstNumber(text: string | undefined): number | null {
  if (!text) return null;
  const m = /\d+/.exec(text);
  return m ? Number(m[0]) : null;
}

function buildSets(planned: PlannedSet[], prev: SessionItem | undefined): DoneSet[] {
  const prevDone = prev ? prev.sets.filter((s) => s.done) : [];
  return planned.map((p, i) => {
    const pv = prev?.sets[i]?.done ? prev.sets[i] : prevDone[i];
    return {
      type: p.type,
      load: pv?.load ?? p.load ?? null,
      reps: null,
      done: false,
      target: p.reps,
      prevLoad: pv?.load ?? null,
      prevReps: pv?.reps ?? null,
      secs: null,
      dist: null,
      prevSecs: pv?.secs ?? null,
      prevDist: pv?.dist ?? null,
      targetSecs: p.secs ?? null,
      targetDist: p.dist ?? null,
    };
  });
}

/** Completa uma série marcada como feita com os valores sugeridos, se estiverem vazios. */
export function fillSet(s: DoneSet): DoneSet {
  return {
    ...s,
    load: s.load ?? s.prevLoad ?? null,
    reps: s.reps ?? s.prevReps ?? firstNumber(s.target) ?? null,
    secs: s.secs ?? s.targetSecs ?? s.prevSecs ?? null,
    dist: s.dist ?? s.targetDist ?? s.prevDist ?? null,
    done: true,
  };
}

async function sessionItemFrom(
  sessionId: string,
  exerciseId: string,
  position: number,
  planned: PlannedSet[],
  supersetNext: boolean,
  note: string,
  extra: Pick<SessionItem, 'repMode' | 'restSeconds' | 'logType' | 'distUnit' | 'interval'> = {},
): Promise<SessionItem> {
  const prev = await lastDoneItemFor(exerciseId);
  const log = await exerciseLog(exerciseId);
  const logType = extra.logType ?? log.logType;
  const cardio = cardioFields(logType, extra.distUnit ?? log.distUnit);
  return {
    id: newId(),
    sessionId,
    exerciseId,
    position,
    supersetNext,
    unit: await exerciseUnit(exerciseId),
    done: false,
    sets: buildSets(planned, prev),
    note,
    repMode: extra.repMode ?? 'faixa',
    ...cardio,
    restSeconds: extra.restSeconds ?? cardio.restSeconds,
    ...(logType === 'tiros' ? { interval: extra.interval ?? cardio.interval } : {}),
    updatedAt: Date.now(),
  };
}

export async function startSession(workoutId: string | null): Promise<string> {
  const active = await getActiveSession();
  if (active) return active.id;
  const now = Date.now();
  const id = newId();
  let title = 'Treino livre';
  let programId: string | null = null;
  const items: SessionItem[] = [];
  if (workoutId) {
    const w = await db.workouts.get(workoutId);
    if (w) {
      title = `${w.letter} · ${w.name}`;
      programId = w.programId;
      const wItems = await itemsOf(workoutId);
      for (const [i, wi] of wItems.entries()) {
        items.push(
          await sessionItemFrom(id, wi.exerciseId, i, wi.sets, wi.supersetNext, wi.note ?? '', {
            repMode: wi.repMode ?? (wi.sets.some((x) => x.reps.includes('-')) ? 'faixa' : 'fixa'),
            restSeconds: wi.restSeconds ?? null,
            logType: wi.logType,
            distUnit: wi.distUnit,
            interval: wi.interval,
          }),
        );
      }
    }
  }
  await put<Session>('sessions', {
    id,
    workoutId,
    programId,
    title,
    date: todayISO(),
    startedAt: now,
    endedAt: null,
    status: 'active',
    manual: false,
    note: '',
    updatedAt: now,
  });
  await putMany('sessionItems', items);
  return id;
}

export async function addExercisesToSession(sessionId: string, exerciseIds: string[]): Promise<void> {
  const items = await sessionItemsOf(sessionId);
  const created: SessionItem[] = [];
  for (const [i, exId] of exerciseIds.entries()) {
    const log = await exerciseLog(exId);
    created.push(await sessionItemFrom(sessionId, exId, items.length + i, plannedSetsFor(log.logType), false, ''));
  }
  await putMany('sessionItems', created);
}

export async function removeSessionItem(id: string): Promise<void> {
  const item = await db.sessionItems.get(id);
  if (!item) return;
  const items = await sessionItemsOf(item.sessionId);
  const idx = items.findIndex((i) => i.id === id);
  if (idx > 0 && !item.supersetNext && items[idx - 1].supersetNext) {
    await patch('sessionItems', items[idx - 1].id, { supersetNext: false });
  }
  await softDelete('sessionItems', id);
  const rest = await sessionItemsOf(item.sessionId);
  for (const [i, it] of rest.entries()) if (it.position !== i) await patch('sessionItems', it.id, { position: i });
}

export async function moveSessionItem(sessionId: string, from: number, to: number): Promise<void> {
  const items = await sessionItemsOf(sessionId);
  if (to < 0 || to >= items.length || from === to) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  for (const [i, it] of items.entries()) {
    const changes: Partial<SessionItem> = {};
    if (it.position !== i) changes.position = i;
    if (i === items.length - 1 && it.supersetNext) changes.supersetNext = false;
    if (Object.keys(changes).length) await patch('sessionItems', it.id, changes);
  }
}

export async function updateSessionItem(id: string, changes: Partial<SessionItem>): Promise<void> {
  await patch('sessionItems', id, changes);
}

export async function toggleSessionSuperset(itemId: string): Promise<void> {
  const item = await db.sessionItems.get(itemId);
  if (item) await patch('sessionItems', itemId, { supersetNext: !item.supersetNext });
}

/** Lê e grava o exercício do treino numa transação: toques rápidos em sequência não se sobrescrevem. */
function editSessionItem(itemId: string, change: (item: SessionItem) => Partial<SessionItem> | undefined): Promise<void> {
  return db.transaction('rw', db.sessionItems, async () => {
    const item = await db.sessionItems.get(itemId);
    const changes = item && change(item);
    if (changes) await patch('sessionItems', itemId, changes);
  });
}

export async function setSessionItemDone(itemId: string, done: boolean): Promise<void> {
  await editSessionItem(itemId, (item) => ({
    done,
    sets: item.sets.map((s) => (done ? (s.done ? s : fillSet(s)) : { ...s, done: false })),
  }));
}

export async function updateSet(itemId: string, index: number, changes: Partial<DoneSet>): Promise<void> {
  await editSessionItem(itemId, (item) => updatedSets(item, index, changes));
}

function updatedSets(item: SessionItem, index: number, changes: Partial<DoneSet>): Partial<SessionItem> | undefined {
  if (!item.sets[index]) return undefined;
  const old = item.sets[index];
  const sets = item.sets.slice();
  sets[index] = { ...old, ...changes };
  if (changes.done === true) sets[index] = fillSet(sets[index]);
  // Carga e repetições digitadas "descem" para as séries seguintes ainda não feitas
  // que estavam iguais (ou vazias) — assim não é preciso repetir o mesmo valor.
  for (const f of ['load', 'reps', 'secs', 'dist'] as const) {
    if (!(f in changes) || changes[f] === old[f]) continue;
    for (let j = index + 1; j < sets.length; j++) {
      const s = sets[j];
      if (s.done || s.type === 'A') continue;
      if (s[f] === null || s[f] === undefined || s[f] === old[f]) sets[j] = { ...s, [f]: changes[f] ?? null };
      else break;
    }
  }
  const allDone = sets.length > 0 && sets.every((s) => s.done);
  return { sets, done: allDone };
}

export async function addSet(itemId: string): Promise<void> {
  await editSessionItem(itemId, (item) => {
    const last = item.sets[item.sets.length - 1];
    const next: DoneSet = {
      type: last && last.type !== 'A' ? last.type : 'N',
      load: last?.load ?? null,
      reps: null,
      done: false,
      target: last?.target ?? (isCardio(item.logType) ? '' : '10'),
      prevLoad: null,
      prevReps: null,
      secs: null,
      dist: null,
      targetSecs: last?.secs ?? last?.targetSecs ?? null,
      targetDist: last?.dist ?? last?.targetDist ?? null,
    };
    return { sets: [...item.sets, next], done: false };
  });
}

export async function removeSet(itemId: string, index: number): Promise<void> {
  await editSessionItem(itemId, (item) => {
    const sets = item.sets.filter((_, i) => i !== index);
    return { sets, done: sets.length > 0 && sets.every((s) => s.done) };
  });
}

/** Troca como o exercício é registrado (neste treino ou rotina) e lembra a escolha para as próximas vezes. */
export async function setItemLogType(
  table: 'sessionItems' | 'workoutItems',
  itemId: string,
  exerciseId: string,
  logType: LogType,
): Promise<void> {
  const item = table === 'sessionItems' ? await db.sessionItems.get(itemId) : await db.workoutItems.get(itemId);
  if (!item) return;
  const changes: Partial<Omit<SessionItem, 'sets'> & Omit<WorkoutItem, 'sets'>> & { sets?: DoneSet[] } = { logType };
  if (logType === 'tiros' && !item.interval) changes.interval = { ...DEFAULT_INTERVAL };
  if (isCardio(logType) && !isCardio(item.logType) && (item.restSeconds === null || item.restSeconds === undefined)) {
    changes.restSeconds = logType === 'tempo' ? null : 0;
  }
  if (table === 'sessionItems') {
    const sets = (item as SessionItem).sets;
    // Tiros: as séries vêm do timer (fica só o que já foi feito). Outros tipos: pelo menos uma linha.
    if (logType === 'tiros') changes.sets = sets.filter((x) => x.done);
    else if (sets.length === 0) changes.sets = [{ type: 'N', load: null, reps: null, done: false, secs: null, dist: null }];
  }
  await patch(table, itemId, changes);
  await savePref(exerciseId, { logType });
}

export async function setItemDistUnit(
  table: 'sessionItems' | 'workoutItems',
  itemId: string,
  exerciseId: string,
  distUnit: DistUnit,
): Promise<void> {
  await patch(table, itemId, { distUnit });
  await savePref(exerciseId, { distUnit });
}

/** Tiros: registra um tiro terminado como série feita. */
export async function logTiro(itemId: string, secs: number): Promise<void> {
  await editSessionItem(itemId, (item) => ({
    sets: [...item.sets, { type: 'N', load: null, reps: null, done: true, secs: Math.round(secs), dist: null }],
  }));
}

export async function setSessionItemUnit(itemId: string, exerciseId: string, unit: LoadUnit): Promise<void> {
  await patch('sessionItems', itemId, { unit });
  await savePref(exerciseId, { unit });
}

export async function finishSession(id: string): Promise<void> {
  await patch('sessions', id, { status: 'done', endedAt: Date.now() });
}

export async function deleteSession(id: string): Promise<void> {
  for (const it of await sessionItemsOf(id)) await softDelete('sessionItems', it.id);
  await softDelete('sessions', id);
}

export async function updateSession(id: string, changes: Partial<Session>): Promise<void> {
  await patch('sessions', id, changes);
}

/** Cria um treino registrado à mão (sem cronômetro). */
export async function createManualSession(input: {
  date: string;
  workoutId: string | null;
  title: string;
  startedAt: number | null;
  endedAt: number | null;
  note: string;
  doneExerciseIds: string[];
}): Promise<string> {
  const id = newId();
  let programId: string | null = null;
  const items: SessionItem[] = [];
  if (input.workoutId) {
    const w = await db.workouts.get(input.workoutId);
    programId = w?.programId ?? null;
    const wItems = await itemsOf(input.workoutId);
    for (const [i, wi] of wItems.entries()) {
      const unit = await exerciseUnit(wi.exerciseId);
      items.push({
        id: newId(),
        sessionId: id,
        exerciseId: wi.exerciseId,
        position: i,
        supersetNext: wi.supersetNext,
        unit,
        done: input.doneExerciseIds.includes(wi.exerciseId),
        sets: wi.sets.map((p) => ({ type: p.type, load: p.load, reps: null, done: false, target: p.reps })),
        note: '',
        updatedAt: Date.now(),
      });
    }
  }
  await put<Session>('sessions', {
    id,
    workoutId: input.workoutId,
    programId,
    title: input.title,
    date: input.date,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: 'done',
    manual: true,
    note: input.note,
    updatedAt: Date.now(),
  });
  await putMany('sessionItems', items);
  return id;
}

export async function setSessionItemDoneFlag(itemId: string, done: boolean): Promise<void> {
  await patch('sessionItems', itemId, { done });
}

// ---------------------------------------------------------------- Exercícios próprios e preferências

export async function saveCustomExercise(
  ex: Omit<CustomExercise, 'updatedAt' | 'id'> & { id?: string },
): Promise<string> {
  const id = ex.id ?? `u-${newId()}`;
  await put<CustomExercise>('customExercises', { ...ex, id, updatedAt: Date.now() });
  return id;
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await softDelete('customExercises', id);
}

export async function savePref(exerciseId: string, changes: Partial<ExercisePref>): Promise<void> {
  const current = await db.exercisePrefs.get(exerciseId);
  await put<ExercisePref>('exercisePrefs', {
    ...(current ?? { id: exerciseId, updatedAt: 0 }),
    ...changes,
    id: exerciseId,
    deleted: 0,
  });
}

// ---------------------------------------------------------------- Corpo e medidas

export async function saveBodyEntry(entry: Omit<BodyEntry, 'updatedAt' | 'id'> & { id?: string }): Promise<string> {
  const id = entry.id ?? newId();
  await put<BodyEntry>('bodyEntries', { ...entry, id, updatedAt: Date.now() });
  return id;
}

export async function deleteBodyEntry(id: string): Promise<void> {
  await softDelete('bodyEntries', id);
}
