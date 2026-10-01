import { useLiveQuery } from 'dexie-react-hooks';
import { BODY, type BodyGender, type BodyView } from '../data/bodyMap';
import { MUSCLE_BY_ID } from './muscles';
import { getProfile } from './repo';
import type { MuscleId } from './types';

export type { BodyGender, BodyView };

export interface BodyPart {
  slug: string;
  d: string;
}

/** Partes que não são músculo (ficam num cinza mais escuro). */
export const NON_MUSCLE = new Set(['head', 'hair', 'hands', 'feet', 'ankles', 'knees', 'neck']);

const partsCache = new Map<string, BodyPart[]>();

export function bodyParts(gender: BodyGender, view: BodyView): BodyPart[] {
  const key = `${gender}.${view}`;
  let list = partsCache.get(key);
  if (!list) {
    list = [];
    for (const [slug, p] of Object.entries(BODY[gender][view].parts)) {
      for (const d of [...p.l, ...p.r, ...p.c]) list.push({ slug, d });
    }
    partsCache.set(key, list);
  }
  return list;
}

// Tamanho de cada parte, medido uma vez num SVG escondido (para o zoom e para separar dorsal do meio das costas).
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const boxes = new Map<string, Box>();
let probe: SVGSVGElement | null = null;

function partBox(d: string): Box {
  const cached = boxes.get(d);
  if (cached) return cached;
  if (!probe) {
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;';
    document.body.appendChild(probe);
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  probe.appendChild(path);
  const b = path.getBBox();
  path.remove();
  const box = { x: b.x, y: b.y, w: b.width, h: b.height };
  boxes.set(d, box);
  return box;
}

type Test = (p: BodyPart) => boolean;
const slug =
  (...names: string[]): Test =>
  (p) =>
    names.includes(p.slug);

/** Quais partes do desenho formam cada grupo muscular do app. */
const MUSCLE_TEST: Partial<Record<MuscleId, Test>> = {
  peito: slug('chest'),
  dorsal: (p) => p.slug === 'upper-back' && partBox(p.d).h > 130,
  costas: (p) => (p.slug === 'upper-back' && partBox(p.d).h <= 130) || p.slug === 'trapezius',
  lombar: slug('lower-back'),
  ombros: slug('deltoids'),
  trapezio: slug('trapezius'),
  biceps: slug('biceps'),
  triceps: slug('triceps'),
  antebraco: slug('forearm'),
  abdomen: slug('abs', 'obliques'),
  quadriceps: slug('quadriceps'),
  posterior: slug('hamstring'),
  gluteos: slug('gluteal'),
  panturrilha: slug('calves'),
  adutores: slug('adductors'),
  abdutores: (p) => p.slug === 'gluteal' && partBox(p.d).h < 100,
  corpo: (p) => !NON_MUSCLE.has(p.slug),
};

export function muscleView(id: MuscleId): BodyView {
  return MUSCLE_BY_ID[id]?.view === 'b' ? 'back' : 'front';
}

export function muscleTest(id: MuscleId): Test {
  return MUSCLE_TEST[id] ?? (() => false);
}

const viewBoxes = new Map<string, string>();

/** Enquadramento aproximado na região do músculo (corpo inteiro para "Corpo inteiro"). */
export function muscleViewBox(gender: BodyGender, id: MuscleId): string {
  const view = muscleView(id);
  if (id === 'corpo') return BODY[gender][view].vb;
  const key = `${gender}.${id}`;
  const cached = viewBoxes.get(key);
  if (cached) return cached;
  const test = muscleTest(id);
  const hits = bodyParts(gender, view)
    .filter(test)
    .map((p) => partBox(p.d));
  if (hits.length === 0) return BODY[gender][view].vb;
  const x1 = Math.min(...hits.map((b) => b.x));
  const y1 = Math.min(...hits.map((b) => b.y));
  const x2 = Math.max(...hits.map((b) => b.x + b.w));
  const y2 = Math.max(...hits.map((b) => b.y + b.h));
  const size = Math.max(x2 - x1, y2 - y1) * 1.35 + 80;
  const vb = [(x1 + x2) / 2 - size / 2, (y1 + y2) / 2 - size / 2, size, size].map((n) => Math.round(n)).join(' ');
  viewBoxes.set(key, vb);
  return vb;
}

export interface MusclesDrawing {
  viewBox: string;
  paths: { d: string; tone: 'main' | 'also' | 'skin' | 'base' }[];
}

const drawings = new Map<string, MusclesDrawing | null>();

/**
 * Corpo enquadrado no músculo principal e nos que também trabalham (o selinho da lista do treino).
 * Cardio usa o primeiro músculo secundário como principal (ex.: bicicleta → quadríceps).
 */
export function musclesDrawing(gender: BodyGender, primary: MuscleId, secondary: MuscleId[]): MusclesDrawing | null {
  const key = `${gender}.${primary}.${secondary.join(',')}`;
  if (drawings.has(key)) return drawings.get(key)!;
  let main = primary;
  let also = secondary;
  if (MUSCLE_BY_ID[main]?.view === 'i') {
    main = secondary[0];
    also = secondary.slice(1);
  }
  if (!main || !MUSCLE_BY_ID[main] || MUSCLE_BY_ID[main].view === 'i') {
    drawings.set(key, null);
    return null;
  }
  const view = muscleView(main);
  const parts = bodyParts(gender, view);
  const isMain = muscleTest(main);
  const alsoTests = also.filter((m) => MUSCLE_BY_ID[m]?.view !== 'i').map(muscleTest);
  const isAlso = (p: BodyPart) => alsoTests.some((t) => t(p));
  let viewBox = BODY[gender][view].vb;
  if (main !== 'corpo') {
    const hits = parts.filter((p) => isMain(p) || isAlso(p)).map((p) => partBox(p.d));
    if (hits.length > 0) {
      const x1 = Math.min(...hits.map((b) => b.x));
      const y1 = Math.min(...hits.map((b) => b.y));
      const x2 = Math.max(...hits.map((b) => b.x + b.w));
      const y2 = Math.max(...hits.map((b) => b.y + b.h));
      const size = Math.max(x2 - x1, y2 - y1) * 1.18 + 40;
      viewBox = [(x1 + x2) / 2 - size / 2, (y1 + y2) / 2 - size / 2, size, size].map((n) => Math.round(n)).join(' ');
    }
  }
  const drawing: MusclesDrawing = {
    viewBox,
    paths: parts.map((p) => ({ d: p.d, tone: isMain(p) ? 'main' : isAlso(p) ? 'also' : NON_MUSCLE.has(p.slug) ? 'skin' : 'base' })),
  };
  drawings.set(key, drawing);
  return drawing;
}

/** Corpo usado nos desenhos (masculino ou feminino), escolhido no Perfil. */
export function useBodyGender(): BodyGender {
  return useLiveQuery(async () => (await getProfile()).body ?? 'male', [], 'male');
}
