export type MuscleId =
  | 'peito'
  | 'dorsal'
  | 'costas'
  | 'lombar'
  | 'ombros'
  | 'trapezio'
  | 'biceps'
  | 'triceps'
  | 'antebraco'
  | 'abdomen'
  | 'quadriceps'
  | 'posterior'
  | 'gluteos'
  | 'panturrilha'
  | 'adutores'
  | 'abdutores'
  | 'corpo'
  | 'cardio';

export type EquipmentId =
  | 'barra'
  | 'halter'
  | 'maquina'
  | 'polia'
  | 'smith'
  | 'peso_corpo'
  | 'kettlebell'
  | 'elastico'
  | 'outro';

export type LoadUnit = 'kg' | 'lb' | 'placa';

/** A = aquecimento, N = normal, F = até a falha, D = drop-set */
export type SetType = 'A' | 'N' | 'F' | 'D';

/** Exercício da biblioteca padrão (vem junto com o app, não sincroniza). */
export interface CatalogExercise {
  id: string;
  name: string;
  primary: MuscleId;
  secondary: MuscleId[];
  equipment: EquipmentId;
  /** Animação (GIF) do ExerciseDB, quando existir. */
  gif?: string;
  /** Fotos do free-exercise-db (domínio público), quando existirem. */
  images?: string[];
  /** Passo a passo curto em português. */
  steps: string[];
  /** Unidade sugerida (ex.: 'placa' para polias). Padrão: kg. */
  unit?: LoadUnit;
}

/** Campos de controle comuns a tudo que sincroniza com o Supabase. */
export interface Synced {
  id: string;
  updatedAt: number;
  deleted?: 0 | 1;
  dirty?: 0 | 1;
}

/** Exercício criado pelo usuário. */
export interface CustomExercise extends Synced {
  name: string;
  primary: MuscleId;
  secondary: MuscleId[];
  equipment: EquipmentId;
  unit: LoadUnit;
  photos: string[];
  videoUrl?: string;
  tips?: string;
}

/** Preferências do usuário para qualquer exercício (id = id do exercício). */
export interface ExercisePref extends Synced {
  unit?: LoadUnit;
  note?: string;
  videoUrl?: string;
  /** Como registrar este exercício (padrão: pelo tipo do exercício). */
  logType?: LogType;
  distUnit?: DistUnit;
}

/** Como um exercício é registrado: carga e reps, só tempo, tempo e distância, ou tiros com timer. */
export type LogType = 'carga' | 'tempo' | 'tempo_km' | 'tiros';
export type DistUnit = 'km' | 'm';

/** Tiros: tempo de tiro e de descanso (segundos) e número de rodadas. */
export interface IntervalConfig {
  work: number;
  rest: number;
  rounds: number;
}

export type ProgramStatus = 'active' | 'ready' | 'archived';

/** Ficha de treino (conjunto de treinos A, B, C...). */
export interface Program extends Synced {
  name: string;
  status: ProgramStatus;
  createdAt: number;
  startedAt?: number | null;
  endedAt?: number | null;
}

export interface Workout extends Synced {
  programId: string;
  letter: string;
  name: string;
  position: number;
  restSeconds: number;
}

export interface PlannedSet {
  type: SetType;
  reps: string;
  load: number | null;
  /** Cardio: meta de tempo (s) e de distância (na unidade do exercício). */
  secs?: number | null;
  dist?: number | null;
}

/** Repetições fixas ("10") ou faixa ("8-12"). */
export type RepMode = 'fixa' | 'faixa';

export interface WorkoutItem extends Synced {
  workoutId: string;
  exerciseId: string;
  position: number;
  /** true = faz superset com o próximo exercício da lista. */
  supersetNext: boolean;
  sets: PlannedSet[];
  note?: string;
  repMode?: RepMode;
  /** Descanso deste exercício (s). Vazio = usa o do treino. */
  restSeconds?: number | null;
  logType?: LogType;
  distUnit?: DistUnit;
  interval?: IntervalConfig;
}

export type SessionStatus = 'active' | 'done';

/** Um treino realizado (ou em andamento). */
export interface Session extends Synced {
  workoutId: string | null;
  programId: string | null;
  title: string;
  /** Data no formato AAAA-MM-DD. */
  date: string;
  startedAt: number | null;
  endedAt: number | null;
  status: SessionStatus;
  manual: boolean;
  note?: string;
}

export interface DoneSet {
  type: SetType;
  load: number | null;
  reps: number | null;
  done: boolean;
  /** Repetições planejadas (ex.: "10" ou "8-12"). */
  target?: string;
  /** O que foi feito nesta série na última vez. */
  prevLoad?: number | null;
  prevReps?: number | null;
  /** Cardio: tempo (s) e distância (na unidade do exercício). */
  secs?: number | null;
  dist?: number | null;
  prevSecs?: number | null;
  prevDist?: number | null;
  /** Meta de tempo e distância vinda da rotina. */
  targetSecs?: number | null;
  targetDist?: number | null;
}

export interface SessionItem extends Synced {
  sessionId: string;
  exerciseId: string;
  position: number;
  supersetNext: boolean;
  /** Unidade usada nas cargas deste exercício neste treino. */
  unit: LoadUnit;
  done: boolean;
  sets: DoneSet[];
  note?: string;
  repMode?: RepMode;
  restSeconds?: number | null;
  logType?: LogType;
  distUnit?: DistUnit;
  interval?: IntervalConfig;
}

export interface BodyEntry extends Synced {
  date: string;
  weight: number | null;
  bodyFat: number | null;
  measures: Record<string, number>;
  photo?: string | null;
}

export interface Profile extends Synced {
  name: string;
  heightCm: number | null;
  goal: string;
  weeklyGoal: number;
  restSeconds: number;
  /** Corpo usado nos desenhos de músculos e medidas. */
  body?: 'male' | 'female';
}
