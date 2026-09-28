import Dexie, { type Table } from 'dexie';
import type {
  BodyEntry,
  CustomExercise,
  ExercisePref,
  Profile,
  Program,
  Session,
  SessionItem,
  Workout,
  WorkoutItem,
} from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

class AppDB extends Dexie {
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
  workoutItems!: Table<WorkoutItem, string>;
  sessions!: Table<Session, string>;
  sessionItems!: Table<SessionItem, string>;
  customExercises!: Table<CustomExercise, string>;
  exercisePrefs!: Table<ExercisePref, string>;
  bodyEntries!: Table<BodyEntry, string>;
  profile!: Table<Profile, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('meu-treino');
    this.version(1).stores({
      programs: 'id, status, dirty',
      workouts: 'id, programId, dirty',
      workoutItems: 'id, workoutId, exerciseId, dirty',
      sessions: 'id, date, status, workoutId, programId, dirty',
      sessionItems: 'id, sessionId, exerciseId, dirty',
      customExercises: 'id, dirty',
      exercisePrefs: 'id, dirty',
      bodyEntries: 'id, date, dirty',
      profile: 'id, dirty',
      meta: 'key',
    });
  }
}

export const db = new AppDB();

/** Tabelas que sincronizam com o Supabase (o nome vira o campo "kind" lá). */
export const SYNCED_TABLES = [
  'programs',
  'workouts',
  'workoutItems',
  'sessions',
  'sessionItems',
  'customExercises',
  'exercisePrefs',
  'bodyEntries',
  'profile',
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

export function tableOf(name: SyncedTableName): Table<any, string> {
  return db[name] as Table<any, string>;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Pede ao navegador para não apagar os dados do app quando faltar espaço. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // sem suporte: segue normalmente
  }
}
