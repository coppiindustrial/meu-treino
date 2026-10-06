import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CATALOG } from '../data/catalog';
import { db } from './db';
import { defaultLogType } from './cardio';
import type { CustomExercise, DistUnit, EquipmentId, ExercisePref, LoadUnit, LogType, MuscleId } from './types';

export interface ExerciseView {
  id: string;
  name: string;
  primary: MuscleId;
  secondary: MuscleId[];
  equipment: EquipmentId;
  gif?: string;
  images: string[];
  steps: string[];
  unit: LoadUnit;
  /** Como registrar (carga e reps, só tempo, tempo e km, tiros). */
  logType: LogType;
  distUnit: DistUnit;
  custom: boolean;
  videoUrl?: string;
  tips?: string;
  note?: string;
}

const CATALOG_MAP = new Map(CATALOG.map((e) => [e.id, e]));

function merge(custom: CustomExercise[], prefs: ExercisePref[]): ExerciseView[] {
  const prefMap = new Map(prefs.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const list: ExerciseView[] = CATALOG.map((c) => {
    const p = prefMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      primary: c.primary,
      secondary: c.secondary,
      equipment: c.equipment,
      gif: c.gif,
      images: c.images ?? [],
      steps: c.steps,
      unit: p?.unit ?? c.unit ?? 'kg',
      logType: p?.logType ?? defaultLogType(c.id, c.primary),
      distUnit: p?.distUnit ?? 'km',
      custom: false,
      videoUrl: p?.videoUrl,
      note: p?.note,
    };
  });
  for (const c of custom) {
    if (c.deleted) continue;
    const p = prefMap.get(c.id);
    list.push({
      id: c.id,
      name: c.name,
      primary: c.primary,
      secondary: c.secondary,
      equipment: c.equipment,
      images: c.photos ?? [],
      steps: [],
      unit: p?.unit ?? c.unit ?? 'kg',
      logType: p?.logType ?? defaultLogType(c.id, c.primary),
      distUnit: p?.distUnit ?? 'km',
      custom: true,
      videoUrl: p?.videoUrl ?? c.videoUrl,
      tips: c.tips,
      note: p?.note,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Todos os exercícios (padrão + criados por você), já com suas preferências. */
export function useExercises(): { list: ExerciseView[]; map: Map<string, ExerciseView>; ready: boolean } {
  const data = useLiveQuery(async () => {
    const [custom, prefs] = await Promise.all([db.customExercises.toArray(), db.exercisePrefs.toArray()]);
    return { custom, prefs };
  }, []);
  return useMemo(() => {
    const list = merge(data?.custom ?? [], data?.prefs ?? []);
    return { list, map: new Map(list.map((e) => [e.id, e])), ready: data !== undefined };
  }, [data]);
}

export function missingExercise(id: string): ExerciseView {
  return {
    id,
    name: 'Exercício removido',
    primary: 'corpo',
    secondary: [],
    equipment: 'outro',
    images: [],
    steps: [],
    unit: 'kg',
    logType: 'carga',
    distUnit: 'km',
    custom: true,
  };
}

export function exerciseOrMissing(map: Map<string, ExerciseView>, id: string): ExerciseView {
  return map.get(id) ?? missingExercise(id);
}

export async function exerciseUnit(id: string): Promise<LoadUnit> {
  const pref = await db.exercisePrefs.get(id);
  if (pref && !pref.deleted && pref.unit) return pref.unit;
  const custom = await db.customExercises.get(id);
  if (custom && !custom.deleted) return custom.unit ?? 'kg';
  return CATALOG_MAP.get(id)?.unit ?? 'kg';
}

/** Tipo de registro e unidade de distância de um exercício (preferência do usuário ou padrão). */
export async function exerciseLog(id: string): Promise<{ logType: LogType; distUnit: DistUnit; primary: MuscleId }> {
  const pref = await db.exercisePrefs.get(id);
  const live = pref && !pref.deleted ? pref : undefined;
  const custom = await db.customExercises.get(id);
  const primary = custom && !custom.deleted ? custom.primary : CATALOG_MAP.get(id)?.primary ?? 'corpo';
  return { logType: live?.logType ?? defaultLogType(id, primary), distUnit: live?.distUnit ?? 'km', primary };
}

export function thumbOf(ex: ExerciseView): string | undefined {
  return ex.images[0] ?? ex.gif;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
