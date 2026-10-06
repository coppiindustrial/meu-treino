import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { EmptyState, LoadingScreen } from '../components/Layout';
import { db } from '../lib/db';
import { loadText } from '../lib/equipment';
import { ExerciseThumb } from '../components/Media';
import { Sheet } from '../components/Sheet';
import { exerciseOrMissing, normalize, useExercises, type ExerciseView } from '../lib/exercises';
import { muscleName } from '../lib/muscles';
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

// Onde a bolha do seletor estava: ao trocar de Cargas para Corpo ela desliza a partir dali.
let lastTab: 'cargas' | 'corpo' = 'cargas';

/** Título "Progresso" e o seletor Cargas | Corpo, que troca sem parecer mudança de página. */
export function ProgressHead({ active }: { active: 'cargas' | 'corpo' }) {
  const [shown, setShown] = useState(lastTab);
  useEffect(() => {
    lastTab = active;
    const raf = requestAnimationFrame(() => setShown(active));
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <>
      <header className="tab-head">
        <h1 className="h1">Progresso</h1>
        {active === 'corpo' && (
          <Link to="/progresso/medidas/nova" className="glass circle" aria-label="Registrar medidas">
            <Icon name="plus" size={22} stroke={2.4} />
          </Link>
        )}
      </header>
      <div className="seg sliding">
        <span className="seg-bubble" aria-hidden="true" style={{ transform: shown === 'corpo' ? 'translateX(calc(100% + 4px))' : 'none' }} />
        {active === 'cargas' ? (
          <span className="on">Cargas</span>
        ) : (
          <Link to="/progresso" data-nav="side-back" data-replace="">
            Cargas
          </Link>
        )}
        {active === 'corpo' ? (
          <span className="on">Corpo</span>
        ) : (
          <Link to="/progresso/corpo" data-nav="side-forward" data-replace="">
            Corpo
          </Link>
        )}
      </div>
    </>
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

  if (!used) return <LoadingScreen tabs />;

  const ex = selected ? exerciseOrMissing(map, selected) : null;
  const days = PERIODS.find((p) => p.id === period)?.days ?? 0;
  const cutoff = days ? addDays(todayISO(), -days) : '0000-00-00';
  const points = (history ?? []).filter((p) => p.date >= cutoff && ex && p.unit === ex.unit && p.best !== null);
  const best = points.reduce<number | null>((m, p) => (m === null || (p.best ?? 0) > m ? p.best : m), null);
  const first = points[0];
  const change = first && points.length > 1 ? (points[points.length - 1].best ?? 0) - (first.best ?? 0) : null;
  const recent = [...(history ?? [])].reverse().slice(0, 4);

  return (
    <main className="screen tight fade-in">
      <ProgressHead active="cargas" />
      <div className="seg-content">

      {used.length === 0 || !ex ? (
        <EmptyState title="Ainda sem registros" text="Finalize seu primeiro treino para ver a evolução das cargas aqui." />
      ) : (
        <>
          <ExerciseChooser ex={ex} used={used.map((id) => exerciseOrMissing(map, id))} onPick={setChosen} />

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
      </div>
    </main>
  );
}

/** Cartão do exercício escolhido, atalhos dos recentes e janela com busca para trocar. */
function ExerciseChooser({ ex, used, onPick }: { ex: ExerciseView; used: ExerciseView[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const recent = used.slice(0, 5);
  const q = normalize(query.trim());
  const found = q ? used.filter((e) => normalize(e.name).includes(q)) : [];
  const rest = used.slice(5);
  const groups = new Map<string, ExerciseView[]>();
  for (const e of rest) {
    const key = muscleName(e.primary);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQuery('');
  };
  const row = (e: ExerciseView) => (
    <button key={e.id} type="button" className="routine-row chooser-row" onClick={() => pick(e.id)}>
      <span className="ex-avatar">
        <ExerciseThumb exercise={e} />
      </span>
      <span className="col grow" style={{ gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{e.name}</span>
        <span className="tiny muted">{muscleName(e.primary)}</span>
      </span>
      {e.id === ex.id && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
    </button>
  );

  return (
    <>
      <div className="card chooser-card">
        <span className="ex-avatar">
          <ExerciseThumb exercise={ex} />
        </span>
        <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
          <span className="ellipsis" style={{ fontWeight: 600, fontSize: 16 }}>
            {ex.name}
          </span>
          <span className="tiny muted">{muscleName(ex.primary)}</span>
        </span>
        <button type="button" className="glass pill" onClick={() => setOpen(true)}>
          Trocar
        </button>
      </div>

      {recent.length > 1 && (
        <div className="chips-scroll" role="list" aria-label="Exercícios recentes">
          {recent.map((e) => (
            <button key={e.id} type="button" role="listitem" className={`ex-chip ${e.id === ex.id ? 'on' : ''}`} onClick={() => onPick(e.id)}>
              <span className="ex-avatar mini">
                <ExerciseThumb exercise={e} />
              </span>
              <span>{e.name}</span>
            </button>
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Escolher exercício" subtitle="Só aparecem os que você já fez">
        <label className="search">
          <Icon name="search" size={20} />
          <input type="search" value={query} placeholder="Buscar exercício" aria-label="Buscar exercício" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chooser-list">
          {q ? (
            found.length ? (
              found.map(row)
            ) : (
              <p className="small muted" style={{ padding: '12px 4px' }}>
                Nenhum exercício feito com esse nome.
              </p>
            )
          ) : (
            <>
              <span className="label chooser-label">Recentes</span>
              {recent.map(row)}
              {[...groups.entries()].map(([name, list]) => (
                <div key={name}>
                  <span className="label chooser-label">{name}</span>
                  {list.map(row)}
                </div>
              ))}
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
