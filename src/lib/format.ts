const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data local no formato AAAA-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Converte AAAA-MM-DD em Date local (meio-dia, evita problemas de fuso). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Segunda-feira da semana da data. */
export function weekStart(iso: string): string {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[fromISODate(iso).getDay()];
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS_LONG[fromISODate(iso).getDay()];
}

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex];
}

/** 27/09 */
export function dayMonth(iso: string): string {
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** 27/09/2026 */
export function fullDate(iso: string): string {
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Domingo, 27 de setembro */
export function longDate(iso: string): string {
  const d = fromISODate(iso);
  const wd = WEEKDAYS_LONG[d.getDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** Hoje, ontem ou "quarta, 23/09". */
export function relativeDay(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'hoje';
  if (iso === addDays(today, -1)) return 'ontem';
  return `${weekdayLong(iso)}, ${dayMonth(iso)}`;
}

export function timeHM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 00:32:15 */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

/** 1:30 */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** 52 min ou 1h 05min */
export function duration(minutesTotal: number): string {
  const m = Math.max(0, Math.round(minutesTotal));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}min`;
}

export function sessionMinutes(startedAt: number | null, endedAt: number | null): number | null {
  if (!startedAt || !endedAt || endedAt <= startedAt) return null;
  return (endedAt - startedAt) / 60000;
}

/** 42,5 */
export function num(n: number | null | undefined, maxDecimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: maxDecimals });
}

/** Aceita "42,5" ou "42.5". */
export function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "HH:MM" + data -> timestamp */
export function combineDateTime(iso: string, hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const d = fromISODate(iso);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
