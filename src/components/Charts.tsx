import { THEME } from '../lib/theme';
import { num } from '../lib/format';

export interface ChartPoint {
  label: string;
  value: number;
}

function niceStep(range: number): number {
  const raw = range / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Gráfico de linha simples (carga ao longo do tempo). */
export function LineChart({ points, height = 150 }: { points: ChartPoint[]; height?: number }) {
  const W = 350;
  const H = height;
  const left = 36;
  const right = 12;
  const top = 18;
  const bottom = 24;
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(4)));

  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const x = (i: number) => (points.length === 1 ? left + plotW / 2 : left + (i / (points.length - 1)) * plotW);
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} ${x(points.length - 1).toFixed(1)},${top + plotH} ${x(0).toFixed(1)},${top + plotH}`;
  const last = points[points.length - 1];

  const labelIdx = new Set<number>([0, points.length - 1]);
  if (points.length > 4) labelIdx.add(Math.floor((points.length - 1) / 2));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico com ${points.length} registros, último ${num(last.value)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} y1={y(t)} x2={W - right} y2={y(t)} stroke={THEME.grid} strokeDasharray="3 4" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={THEME.muted}>
              {num(t)}
            </text>
          </g>
        ))}
        <polygon points={area} fill={THEME.accent} fillOpacity={0.1} />
        <polyline points={line} fill="none" stroke={THEME.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          i === points.length - 1 ? (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={6} fill={THEME.accent} />
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={THEME.bg} stroke={THEME.accent} strokeWidth={2} />
          ),
        )}
        <text
          x={Math.min(x(points.length - 1), W - right)}
          y={Math.max(y(last.value) - 12, 11)}
          textAnchor="end"
          fontSize="12"
          fontWeight="800"
          fill={THEME.text}
        >
          {num(last.value)}
        </text>
        {[...labelIdx].map((i) => (
          <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill={THEME.muted}>
            {points[i].label}
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
