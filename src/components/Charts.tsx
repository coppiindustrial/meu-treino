import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { THEME } from '../lib/theme';
import { shortDate } from '../lib/format';

export interface TrendPoint {
  /** Data AAAA-MM-DD. */
  date: string;
  value: number;
}

function niceStep(range: number): number {
  const raw = range / 2;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Evolução ao longo do tempo: eixo com 3 valores, linha e o ponto escolhido destacado (com halo e
 * linha vertical). Tocar ou arrastar escolhe o ponto mais perto; com 1 treino só, o ponto fica no meio.
 */
export function TrendChart({
  points,
  selected,
  onSelect,
  axis,
  unit = 0,
  height = 170,
}: {
  points: TrendPoint[];
  selected: number;
  onSelect: (index: number) => void;
  /** Texto dos valores do eixo (ex.: "36" ou "10:00"). */
  axis: (v: number) => string;
  /** Passo mínimo do eixo (ex.: 60 para o tempo andar em minutos cheios). */
  unit?: number;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  if (points.length === 0) return null;

  const W = 350;
  const H = height;
  const left = 40;
  const right = 14;
  const top = 12;
  const bottom = 24;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const base = unit || 1;
  const step = Math.max(unit, niceStep((max - min) / base) * base);
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step * 2);
  const ticks = [hi, (hi + lo) / 2, lo];

  const x = (i: number) => (points.length === 1 ? left + plotW / 2 : left + (i / (points.length - 1)) * plotW);
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const sel = Math.min(Math.max(selected, 0), points.length - 1);

  // Datas embaixo: primeira, última e a escolhida (sem encavalar).
  const labels = new Set<number>([0, points.length - 1, sel]);
  const shown = [...labels].sort((a, b) => a - b).filter((i, k, arr) => k === 0 || x(i) - x(arr[k - 1]) > 48 || i === sel);

  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || points.length < 2) return;
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i;
    if (best !== sel) onSelect(best);
  };

  return (
    <div className="chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Gráfico com ${points.length} ${points.length === 1 ? 'treino' : 'treinos'}; escolhido ${axis(points[sel].value)} em ${shortDate(points[sel].date)}`}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          dragging.current = true;
          pick(e);
        }}
        onPointerMove={(e) => dragging.current && pick(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={left} y1={y(t)} x2={W - right} y2={y(t)} stroke={THEME.grid} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={THEME.muted}>
              {axis(t)}
            </text>
          </g>
        ))}
        <line x1={x(sel)} y1={top} x2={x(sel)} y2={top + plotH} stroke={THEME.accent} strokeOpacity={0.55} strokeWidth={1.5} />
        {points.length > 1 && <polyline points={line} fill="none" stroke={THEME.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (i === sel ? null : <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={THEME.accent} />))}
        <circle cx={x(sel)} cy={y(points[sel].value)} r={11} fill={THEME.accent} fillOpacity={0.25} />
        <circle cx={x(sel)} cy={y(points[sel].value)} r={6} fill={THEME.accent} />
        {shown.map((i) => (
          <text
            key={`d${i}`}
            x={Math.min(Math.max(x(i), left + 16), W - right - 16)}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fill={i === sel ? THEME.text : THEME.muted}
          >
            {shortDate(points[i].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Linha pequena, sem eixos. */
export function Sparkline({ values, width = 90, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={THEME.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill={THEME.accent} />
    </svg>
  );
}
