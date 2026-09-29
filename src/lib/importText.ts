import { normalize, type ExerciseView } from './exercises';
import type { EquipmentId, PlannedSet, RepMode, SetType } from './types';

// ---------------------------------------------------------------- Leitura do texto

export interface ParsedLine {
  /** Linha como veio no texto (sem a numeração). */
  raw: string;
  /** Parte que descreve o exercício, usada para procurar na biblioteca. */
  name: string;
  sets: number;
  reps: string;
  type: SetType;
  repMode: RepMode;
  note: string;
}

export interface ParsedDay {
  name: string;
  lines: ParsedLine[];
}

const BULLET = /^\s*(?:\d{1,2}\s*[.)\-–—:]\s+|\d{1,2}[.)]|[-–—•*·▪►]\s*)/;
const DAY_WORD = /^\s*(?:dia|treino|day|rotina|workout|sess[aã]o)\b/i;
const SETS =
  /(\d{1,2})\s*(?:x|×|s[eé]ries?\s+de)\s*((?:at[eé]\s+a\s+)?falha|\d{1,3}(?:\s*(?:-|–|—|a|at[eé]|to)\s*\d{1,3})?)/i;

function cleanName(text: string): string {
  return text.replace(/[\s:;,\-–—=]+$/, '').replace(/^[\s:;,\-–—]+/, '').trim();
}

function parseReps(text: string): { reps: string; type: SetType; repMode: RepMode } {
  if (/falha/i.test(text)) return { reps: '', type: 'F', repMode: 'fixa' };
  const nums = text.match(/\d{1,3}/g) ?? [];
  const [a, b] = nums;
  if (a && b && a !== b) return { reps: `${a}-${b}`, type: 'N', repMode: 'faixa' };
  return { reps: a ?? '10', type: 'N', repMode: 'fixa' };
}

function dayName(line: string): string {
  const trimmed = cleanName(line.replace(BULLET, ''));
  const sep = trimmed.match(/^(.*?)\s*[:\-–—]\s+(.+)$/) ?? trimmed.match(/^(.*?):\s*(.+)$/);
  if (sep && DAY_WORD.test(sep[1])) return cleanName(sep[2]);
  return trimmed;
}

/** Lê um treino colado (dias com listas de exercícios e "3 x 8-12"). */
export function parseWorkoutText(text: string): ParsedDay[] {
  const days: ParsedDay[] = [];
  const last = () => days[days.length - 1];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\*\*|__|#+\s*/g, '').trim();
    if (!line) continue;
    const bullet = BULLET.test(line);
    const sets = line.match(SETS);

    if (!sets && (!bullet || DAY_WORD.test(line))) {
      // Cabeçalho de dia. Um cabeçalho logo após outro (sem exercícios) só troca o nome.
      const name = dayName(line);
      if (days.length > 0 && last().lines.length === 0) last().name = name;
      else days.push({ name, lines: [] });
      continue;
    }

    const body = line.replace(BULLET, '').trim();
    const m = body.match(SETS);
    let name = body;
    let setCount = 3;
    let reps: ReturnType<typeof parseReps> = { reps: '8-12', type: 'N', repMode: 'faixa' };
    let note = '';
    if (m && m.index !== undefined) {
      name = body.slice(0, m.index);
      setCount = Math.min(10, Math.max(1, Number(m[1])));
      reps = parseReps(m[2]);
      note = cleanName(body.slice(m.index + m[0].length).replace(/^\s*(?:reps?|repeti[cç][oõ]es)\b/i, ''));
    }
    name = cleanName(name);
    if (!name) continue;
    if (days.length === 0) days.push({ name: '', lines: [] });
    last().lines.push({ raw: body, name, sets: setCount, ...reps, note });
  }

  return days
    .filter((d) => d.lines.length > 0)
    .map((d, i) => ({ ...d, name: d.name || `Treino ${String.fromCharCode(65 + i)}` }));
}

export function plannedFromLine(line: ParsedLine): PlannedSet[] {
  return Array.from({ length: line.sets }, () => ({ type: line.type, reps: line.reps, load: null }));
}

// ---------------------------------------------------------------- Procura na biblioteca

const STOP = new Set([
  'com', 'na', 'no', 'nas', 'nos', 'de', 'da', 'do', 'das', 'dos', 'em', 'e', 'o', 'a', 'os', 'as',
  'para', 'pelo', 'pela', 'um', 'uma', 'ou', 'the', 'with', 'of', 'x',
]);

const SYNONYMS: Record<string, string> = {
  cabo: 'polia',
  cross: 'crossover',
  pulley: 'polia',
  ez: 'w',
  neutra: 'triangulo',
  neutro: 'triangulo',
  aparelho: 'maquina',
  dumbbell: 'halter',
  db: 'halter',
  halteres: 'halter',
  apoiada: 'apoio',
  apoiado: 'apoio',
  pe: 'pe',
};

const EQUIPMENT_TOKEN: Partial<Record<EquipmentId, string>> = {
  barra: 'barra',
  halter: 'halter',
  maquina: 'maquina',
  polia: 'polia',
  smith: 'smith',
  kettlebell: 'kettlebell',
  elastico: 'elastico',
};

function singular(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('oes')) return `${t.slice(0, -3)}ao`;
  if (t.endsWith('es') && /[rz]$/.test(t.slice(0, -2))) return t.slice(0, -2);
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (!raw || STOP.has(raw)) continue;
    const t = SYNONYMS[raw] ?? SYNONYMS[singular(raw)] ?? singular(raw);
    if (!STOP.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

interface Indexed {
  ex: ExerciseView;
  name: string[];
  extra: string[];
}

function indexList(list: ExerciseView[]): Indexed[] {
  return list.map((ex) => {
    const eq = EQUIPMENT_TOKEN[ex.equipment];
    return { ex, name: tokens(ex.name), extra: eq ? [eq] : [] };
  });
}

/** Nota de 0 a 1: quanto do nome do exercício está no texto (60%) e quanto do texto está no exercício (40%). */
function score(q: string[], c: Indexed): number {
  if (q.length === 0 || c.name.length === 0) return 0;
  const inName = q.filter((t) => c.name.includes(t)).length;
  const inAll = q.filter((t) => c.name.includes(t) || c.extra.includes(t)).length;
  return 0.6 * (inName / c.name.length) + 0.4 * (inAll / q.length);
}

/** Formas de ler o texto: "(a ou b)" e "x ou y" viram variações separadas. */
export function variants(text: string): string[][] {
  let bases = [text];
  const group = text.match(/\(([^)]*)\)/);
  if (group) {
    const inner = group[1];
    const rest = text.replace(group[0], ' ');
    const opts = inner.split(/\s+ou\s+|\//i).map((s) => s.trim()).filter(Boolean);
    bases = opts.length > 1 ? opts.map((o) => `${rest} ${o}`) : [text.replace(/[()]/g, ' ')];
  }
  const out: string[][] = [];
  for (const b of bases) {
    const alts = b.split(/\s+ou\s+|\s*\/\s*/i).map((s) => s.trim()).filter(Boolean);
    const first = tokens(alts[0] ?? '')[0];
    alts.forEach((alt, i) => {
      const t = tokens(alt);
      out.push(t);
      // "Remada em máquina ou curvada apoiada": a segunda opção herda a 1ª palavra.
      if (i > 0 && first && !t.includes(first)) out.push([first, ...t]);
    });
  }
  return out.filter((t) => t.length > 0);
}

export interface Ranked {
  ex: ExerciseView;
  score: number;
}

/** Exercícios mais parecidos com o texto, do melhor para o pior. */
export function rankExercises(text: string, list: ExerciseView[], limit = 40): Ranked[] {
  const idx = indexList(list);
  const vs = variants(text);
  return idx
    .map((c) => ({ ex: c.ex, score: Math.max(0, ...vs.map((q) => score(q, c))) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name, 'pt-BR'))
    .slice(0, limit);
}

export type MatchStatus = 'found' | 'check' | 'missing';

export interface MatchResult {
  status: MatchStatus;
  exerciseId: string | null;
  /** Alternativas para trocar com um toque (a primeira é a escolhida). */
  candidates: string[];
}

export function aliasKey(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, ' ').trim();
}

const FOUND = 0.78;
const MARGIN = 0.08;
const MAYBE = 0.5;

export function matchExercise(text: string, list: ExerciseView[], aliases: Record<string, string> = {}): MatchResult {
  const byId = new Map(list.map((e) => [e.id, e]));
  const remembered = aliases[aliasKey(text)];
  if (remembered && byId.has(remembered)) return { status: 'found', exerciseId: remembered, candidates: [remembered] };

  const idx = indexList(list);
  const vs = variants(text);
  // Melhor exercício de cada variação ("máquina ou halteres" → um para cada).
  const perVariant: string[] = [];
  const all = new Map<string, number>();
  for (const q of vs) {
    let best: Indexed | null = null;
    let bestScore = 0;
    for (const c of idx) {
      const s = score(q, c);
      if (s > (all.get(c.ex.id) ?? 0)) all.set(c.ex.id, s);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best && bestScore >= MAYBE && !perVariant.includes(best.ex.id)) perVariant.push(best.ex.id);
  }
  const ranked = [...all.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;

  if (perVariant.length >= 2) {
    const extra = ranked.filter(([id, s]) => s >= 0.72 && !perVariant.includes(id)).map(([id]) => id);
    return { status: 'check', exerciseId: perVariant[0], candidates: [...perVariant, ...extra].slice(0, 4) };
  }
  if (top && top[1] >= FOUND && (!second || top[1] - second[1] >= MARGIN)) {
    return { status: 'found', exerciseId: top[0], candidates: [top[0]] };
  }
  if (top && top[1] >= MAYBE) {
    const close = ranked.filter(([, s]) => s >= top[1] - 0.15).map(([id]) => id);
    return { status: 'check', exerciseId: top[0], candidates: close.slice(0, 4) };
  }
  return { status: 'missing', exerciseId: null, candidates: ranked.filter(([, s]) => s > 0.2).slice(0, 5).map(([id]) => id) };
}
