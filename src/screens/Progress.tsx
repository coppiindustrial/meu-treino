import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/Layout';
import { db } from '../lib/db';
import { loadText } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { addDays, dayMonth, fromISODate, monthName, num, todayISO } from '../lib/format';
import { exerciseHistory } from '../lib/stats';
import { setsSummary } from './ExerciseDetail';

const PERIODS = [
  { id: '1M', days: 31 },
  { id: '3M', days: 92 },
  { id: '6M', days: 183 },
  { id: '1A', days: 366 },
  { id: 'Tudo', days: 0 },
];

export function ProgressTabs({ active }: { active: 'cargas' | 'corpo' }) {
  return (
    <div className="seg">
      {active === 'cargas' ? <span className="on">Cargas</span> : <Link to="/progresso">Cargas</Link>}
      {active === 'corpo' ? <span className="on">Corpo</span> : <Link to="/progresso/corpo">Corpo</Link>}
    </div>
  );
}

export function Progress() {
  const { map } = useExercises();
  const [chosen, setChosen] = useState<string | null>(null);
  const [period, setPeriod] = useState('3M');

  const used = useLiveQuery(async () => {
    const sessions = await db.sessions.filter((s) => !s.deleted && s.status === 'done').toArray();
    const dates = new Map(sessions.map((s) => [s.id, s.date]));
    const items = await db.sessionItems.filter((i) => !i.deleted && dates.has(i.sessionId) && i.sets.some((x) => x.done)).toArray();
    const last: Record<string, string> = {};
    for (const it of items) {
      const d = dates.get(it.sessionId)!;
      if (!last[it.exerciseId] || d > last[it.exerciseId]) last[it.exerciseId] = d;
    }
    return Object.entries(last)
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([id]) => id);
  }, []);

  const selected = chosen ?? used?.[0] ?? null;
  const history = useLiveQuery(async () => (selected ? exerciseHistory(selected) : []), [selected]);

  if (!used) return <main className="screen" />;

  const ex = selected ? exerciseOrMissing(map, selected) : null;
  const days = PERIODS.find((p) => p.id === period)?.days ?? 0;
  const cutoff = days ? addDays(todayISO(), -days) : '0000-00-00';
  const points = (history ?? []).filter((p) => p.date >= cutoff && ex && p.unit === ex.unit && p.best !== null);
  const best = points.reduce<number | null>((m, p) => (m === null || (p.best ?? 0) > m ? p.best : m), null);
  const first = points[0];
  const change = first && points.length > 1 ? (points[points.length - 1].best ?? 0) - (first.best ?? 0) : null;
  const recent = [...(history ?? [])].reverse().slice(0, 4);

  return (
    <main className="screen tight">
      <h1 className="h1">Progresso</h1>
      <ProgressTabs active="cargas" />

      {used.length === 0 || !ex ? (
        <EmptyState title="Ainda sem registros" text="Finalize seu primeiro treino para ver a evolução das cargas aqui." />
      ) : (
        <>
          <select className="select" aria-label="Exercício" value={selected ?? ''} onChange={(e) => setChosen(e.target.value)}>
            {used.map((id) => (
              <option key={id} value={id}>
                {exerciseOrMissing(map, id).name}
              </option>
            ))}
          </select>

          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="small muted">Maior carga no período</span>
              <span className="display" style={{ fontSize: 46 }}>
                {best !== null ? loadText(best, ex.unit) : '—'}
              </span>
              {change !== null && first && (
                <span className="row small" style={{ gap: 6, color: change >= 0 ? 'var(--accent)' : 'var(--text-2)', fontWeight: 700 }}>
                  <Icon name="chart" size={16} />
                  {change >= 0 ? '+' : ''}
                  {num(change)} desde {monthName(fromISODate(first.date).getMonth())}
                </span>
              )}
            </div>
            <Link to={`/exercicio/${ex.id}`} className="text-btn" style={{ display: 'flex', alignItems: 'center' }}>
              Ver exercício
            </Link>
          </div>

          <div className="row" style={{ gap: 6 }}>
            {PERIODS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`pill ${period === p.id ? 'on' : ''}`}
                style={{ flex: 1, padding: 0, borderRadius: 10 }}
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
              >
                {p.id}
              </button>
            ))}
          </div>

          {points.length >= 2 ? (
            <LineChart points={points.map((p) => ({ label: dayMonth(p.date), value: p.best as number }))} height={170} />
          ) : (
            <div className="empty" style={{ padding: 18 }}>
              <span className="small">Faça esse exercício mais vezes para ver o gráfico.</span>
            </div>
          )}

          <section className="stack">
            <h2 className="h2">Histórico</h2>
            <div className="list-group">
              {recent.map((p) => (
                <Link key={p.sessionId} to={`/sessao/${p.sessionId}/resumo`} className="list-item" style={{ minHeight: 44 }}>
                  <span className="small muted" style={{ width: 44 }}>
                    {dayMonth(p.date)}
                  </span>
                  <span className="grow" style={{ fontSize: 14, fontWeight: 700 }}>
                    {setsSummary(p)}
                  </span>
                  {best !== null && p.best === best && p.unit === ex.unit && (
                    <span className="chip record">
                      <Icon name="trophy" size={14} /> Recorde
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
