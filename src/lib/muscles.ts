import type { MuscleId } from './types';

export type FigureView = 'f' | 'b' | 'i';

export interface MuscleInfo {
  id: MuscleId;
  name: string;
  view: FigureView;
  /** Partes do bonequinho que ficam destacadas. */
  parts: string[];
}

export const FRONT_PARTS = [
  'neck',
  'delts',
  'chest',
  'sides',
  'abs',
  'biceps',
  'forearms',
  'pelvis',
  'quads',
  'adductors',
  'shins',
];

export const BACK_PARTS = [
  'neck',
  'traps',
  'delts',
  'upper',
  'lats',
  'lower',
  'triceps',
  'forearms',
  'glutes',
  'abductors',
  'hams',
  'calves',
];

export const MUSCLES: MuscleInfo[] = [
  { id: 'peito', name: 'Peito', view: 'f', parts: ['chest'] },
  { id: 'dorsal', name: 'Dorsal', view: 'b', parts: ['lats'] },
  { id: 'costas', name: 'Meio das costas', view: 'b', parts: ['upper'] },
  { id: 'lombar', name: 'Lombar', view: 'b', parts: ['lower'] },
  { id: 'ombros', name: 'Ombros', view: 'f', parts: ['delts'] },
  { id: 'trapezio', name: 'Trapézio', view: 'b', parts: ['traps'] },
  { id: 'biceps', name: 'Bíceps', view: 'f', parts: ['biceps'] },
  { id: 'triceps', name: 'Tríceps', view: 'b', parts: ['triceps'] },
  { id: 'antebraco', name: 'Antebraço', view: 'f', parts: ['forearms'] },
  { id: 'abdomen', name: 'Abdômen', view: 'f', parts: ['abs', 'sides'] },
  { id: 'quadriceps', name: 'Quadríceps', view: 'f', parts: ['quads'] },
  { id: 'posterior', name: 'Posterior de coxa', view: 'b', parts: ['hams'] },
  { id: 'gluteos', name: 'Glúteos', view: 'b', parts: ['glutes'] },
  { id: 'panturrilha', name: 'Panturrilha', view: 'b', parts: ['calves'] },
  { id: 'adutores', name: 'Adutores', view: 'f', parts: ['adductors'] },
  { id: 'abdutores', name: 'Abdutores', view: 'b', parts: ['abductors'] },
  { id: 'corpo', name: 'Corpo inteiro', view: 'f', parts: FRONT_PARTS },
  { id: 'cardio', name: 'Cardio', view: 'i', parts: [] },
];

export const MUSCLE_BY_ID = Object.fromEntries(MUSCLES.map((m) => [m.id, m])) as Record<
  MuscleId,
  MuscleInfo
>;

export const MUSCLE_SECTIONS: { title: string; ids: MuscleId[] }[] = [
  {
    title: 'Parte superior',
    ids: ['peito', 'dorsal', 'costas', 'lombar', 'ombros', 'trapezio', 'biceps', 'triceps', 'antebraco', 'abdomen'],
  },
  {
    title: 'Parte inferior',
    ids: ['quadriceps', 'posterior', 'gluteos', 'panturrilha', 'adutores', 'abdutores'],
  },
  { title: 'Outros', ids: ['corpo', 'cardio'] },
];

export function muscleName(id: MuscleId): string {
  return MUSCLE_BY_ID[id]?.name ?? id;
}
