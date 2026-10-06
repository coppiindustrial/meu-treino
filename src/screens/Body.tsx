import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { LoadingScreen } from '../components/Layout';
import { db } from '../lib/db';
import { addDays, dayMonth, fullDate, num, shortDate, todayISO } from '../lib/format';
import { MEASURES } from '../lib/measures';
import type { BodyEntry } from '../lib/types';
import { PERIODS, ProgressHead } from './Progress';

function signed(n: number): string {
  if (Math.abs(n) < 0.05) return '=';
  return `${n > 0 ? '+' : '−'}${num(Math.abs(n))}`;
}

interface Metric {
  key: string;
  name: string;
  unit: string;
  value: (e: BodyEntry) => number | null | undefined;
}

/** Tudo que dá para acompanhar na aba Corpo: peso, gordura e as medidas. */
const METRICS: Metric[] = [
  { key: 'peso', name: 'Peso', unit: 'kg', value: (e) => e.weight },
  { key: 'gordura', name: 'Gordura corporal', unit: '%', value: (e) => e.bodyFat },
  ...MEASURES.map((m) => ({ key: m.key, name: m.name, unit: 'cm', value: (e: BodyEntry) => e.measures?.[m.key] })),
];

const valueText = (v: number, unit: string) => (unit === '%' ? `${num(v)}%` : `${num(v)} ${unit}`);

export function Body() {
  const entries = useLiveQuery(
    async () => (await db.bodyEntries.filter((b) => !b.deleted).toArray()).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [],
  );
  const [photo, setPhoto] = useState<BodyEntry | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [period, setPeriod] = useState('3M');
  const [picked, setPicked] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!entries) return <LoadingScreen tabs />;

  // Cada métrica com os valores em ordem de data (só as que têm pelo menos um registro).
  const ascending = [...entries].reverse();
  const available = METRICS.map((m) => ({
    ...m,
    series: ascending.flatMap((e) => {
      const v = m.value(e);
      return v === null || v === undefined ? [] : [{ date: e.date, value: v }];
    }),
  })).filter((m) => m.series.length > 0);
  const metric = available.find((m) => m.key === chosen) ?? available[0];

  const range = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
  const cutoff = range.days ? addDays(todayISO(), -range.days) : '';
  const points = metric ? metric.series.filter((p) => p.date >= cutoff) : [];
  const sel = picked === null ? points.length - 1 : Math.min(picked, points.length - 1);
  const current = points[sel];
  const change = points.length > 1 ? points[points.length - 1].value - points[0].value : null;

  const choose = (key: string) => {
    setChosen(key);
    setPicked(null);
    setPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const photos = entries.filter((e) => e.photo).slice(0, 7);

  return (
    <main className="screen tight fade-in">
      <ProgressHead active="corpo" />
      <div className="seg-content">

      {!metric ? (
        <p className="small muted" style={{ padding: '16px 0' }}>
          Registre seu peso ou suas medidas no + lá em cima para acompanhar a evolução aqui.
        </p>
      ) : (
        <>
          <button type="button" className="chooser-title" onClick={() => setPickerOpen(true)} aria-label={`Medida: ${metric.name}. Trocar`}>
            <span className="ellipsis">{metric.name}</span>
            <Icon name="down" size={18} color="var(--accent)" />
          </button>

          <div className="col" style={{ gap: 2 }}>
            <span className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="display" style={{ fontSize: 40 }}>
                {current ? valueText(current.value, metric.unit) : '—'}
              </span>
              {current && <span className="small accent-text">{shortDate(current.date)}</span>}
            </span>
            {/* Sem verde ou vermelho: o app não sabe se a meta é ganhar ou perder. */}
            {change !== null && (
              <span className="small" style={{ color: 'var(--text-2)', fontWeight: 700 }}>
                {Math.abs(change) < 0.05 ? '=' : `${change > 0 ? '↑' : '↓'} ${signed(change)} ${metric.unit === '%' ? 'pontos' : metric.unit}`} {range.text}
              </span>
            )}
          </div>

          <div className="period-tabs" role="tablist" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                type="button"
                key={p.id}
                role="tab"
                className={period === p.id ? 'on' : ''}
                aria-selected={period === p.id}
                onClick={() => {
                  setPeriod(p.id);
                  setPicked(null);
                }}
              >
                {p.id}
              </button>
            ))}
          </div>

          {points.length > 0 ? (
            <TrendChart points={points} selected={sel} onSelect={setPicked} axis={(v) => num(v, 1)} />
          ) : (
            <p className="small muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Sem registros neste período.
            </p>
          )}

          <section className="stack" style={{ gap: 0 }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>
              Tudo que você mede
            </h2>
            {available.map((m) => {
              const last = m.series[m.series.length - 1];
              const prev = m.series[m.series.length - 2];
              return (
                <button key={m.key} type="button" className={`measure-row ${m.key === metric.key ? 'on' : ''}`} aria-pressed={m.key === metric.key} onClick={() => choose(m.key)}>
                  <span className="grow">{m.name}</span>
                  <span className="measure-value">{valueText(last.value, m.unit)}</span>
                  <span className="measure-diff">{prev ? signed(last.value - prev.value) : ''}</span>
                </button>
              );
            })}
          </section>
        </>
      )}

      <section className="stack">
        <div className="section-head">
          <h2 className="h2">Fotos</h2>
          <span className="small muted">Só você vê</span>
        </div>
        <div className="photo-grid">
          {photos.map((e) => (
            <button type="button" key={e.id} className="photo-cell" aria-label={`Foto de ${fullDate(e.date)}`} onClick={() => setPhoto(e)}>
              <img src={e.photo!} alt="" />
              <span className="date">{dayMonth(e.date)}</span>
            </button>
          ))}
          <Link to="/progresso/medidas/nova" className="photo-cell photo-add">
            <Icon name="camera" size={22} />
            Adicionar
          </Link>
        </div>
      </section>

      {entries.length > 0 && (
        <section className="stack" style={{ gap: 0 }}>
          <h2 className="h2" style={{ marginBottom: 4 }}>
            Registros
          </h2>
          {entries.map((e) => {
            const count = Object.keys(e.measures ?? {}).length;
            return (
              <Link key={e.id} to={`/progresso/medidas/${e.id}`} className="progress-hist-row">
                <span className="small muted" style={{ width: 44, flex: 'none' }}>
                  {dayMonth(e.date)}
                </span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>
                  {[e.weight !== null ? `${num(e.weight)} kg` : null, count ? `${count} ${count === 1 ? 'medida' : 'medidas'}` : null, e.photo ? 'foto' : null]
                    .filter(Boolean)
                    .join(' · ') || 'Sem dados'}
                </span>
                <Icon name="next" size={16} color="var(--muted)" />
              </Link>
            );
          })}
        </section>
      )}

      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Escolher medida" subtitle="Só aparecem as que você já registrou">
        <div className="chooser-list">
          <div className="chooser-group">
            {available.map((m) => (
              <button key={m.key} type="button" className="chooser-row" onClick={() => choose(m.key)}>
                <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className="tiny muted">
                    {valueText(m.series[m.series.length - 1].value, m.unit)} · {dayMonth(m.series[m.series.length - 1].date)}
                  </span>
                </span>
                {metric && m.key === metric.key && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={photo ? fullDate(photo.date) : undefined}>
        {photo?.photo && <img src={photo.photo} alt={`Foto de progresso de ${fullDate(photo.date)}`} style={{ width: '100%', borderRadius: 14 }} />}
      </Sheet>
    </main>
  );
}
