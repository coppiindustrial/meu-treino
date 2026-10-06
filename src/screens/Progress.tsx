import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { EmptyState, LoadingScreen } from '../components/Layout';
import { db } from '../lib/db';
import { loadText } from '../lib/equipment';
import { ExerciseThumb } from '../components/Media';
import { Sheet } from '../components/Sheet';
import { exerciseOrMissing, normalize, useExercises, type ExerciseView } from '../lib/exercises';
import { muscleName } from '../lib/muscles';
import { addDays, dayMonth, num, shortDate, todayISO } from '../lib/format';
import { cardioTotals, formatDuration, isCardio } from '../lib/cardio';
import { exerciseHistory, type HistoryPoint } from '../lib/stats';
import { setsSummary } from './ExerciseDetail';

export const PERIODS = [
  { id: '1M', days: 31, text: 'em 1 mês' },
  { id: '3M', days: 92, text: 'em 3 meses' },
  { id: '6M', days: 183, text: 'em 6 meses' },
  { id: '1A', days: 366, text: 'em 1 ano' },
  { id: 'Tudo', days: 0, text: 'no total' },
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
  const [picked, setPicked] = useState<number | null>(null);

  // Exercícios já feitos (do mais recente para o mais antigo) e a data do último treino de cada um.
  const used = useLiveQuery(async () => {
    const sessions = await db.sessions.filter((s) => !s.deleted && s.status === 'done').toArray();
    const dates = new Map(sessions.map((s) => [s.id, s.date]));
    const items = await db.sessionItems.filter((i) => !i.deleted && dates.has(i.sessionId) && i.sets.some((x) => x.done)).toArray();
    const last: Record<string, string> = {};
    for (const it of items) {
      const d = dates.get(it.sessionId)!;
      if (!last[it.exerciseId] || d > last[it.exerciseId]) last[it.exerciseId] = d;
    }
    const ids = Object.entries(last)
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([id]) => id);
    return { ids, last };
  }, []);

  const selected = chosen ?? used?.ids[0] ?? null;
  const history = useLiveQuery(async () => (selected ? exerciseHistory(selected) : []), [selected]);

  if (!used) return <LoadingScreen tabs />;

  const ex = selected ? exerciseOrMissing(map, selected) : null;
  const cardio = ex ? isCardio(ex.logType) : false;
  const range = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
  const cutoff = range.days ? addDays(todayISO(), -range.days) : '';
  // Carga: maior carga de cada treino (na unidade do exercício). Cardio: tempo total de cada treino.
  const valueOf = (p: HistoryPoint): number | null =>
    cardio ? cardioTotals(p.sets, p.distUnit).secs || null : ex && p.unit === ex.unit && !isCardio(p.logType) ? p.best : null;
  const show = (v: number) => (cardio ? formatDuration(v) : ex ? loadText(v, ex.unit) : '');
  const points = (history ?? [])
    .filter((p) => p.date >= cutoff)
    .map((p) => ({ date: p.date, value: valueOf(p) }))
    .filter((p): p is { date: string; value: number } => p.value !== null);
  const best = points.reduce<number | null>((m, p) => (m === null || p.value > m ? p.value : m), null);
  const sel = picked === null ? points.length - 1 : Math.min(picked, points.length - 1);
  const change = points.length > 1 ? points[points.length - 1].value - points[0].value : null;
  const recent = [...(history ?? [])].reverse().slice(0, 4);

  return (
    <main className="screen tight fade-in">
      <ProgressHead active="cargas" />
      <div className="seg-content">

      {used.ids.length === 0 || !ex ? (
        <EmptyState title="Ainda sem registros" text="Finalize seu primeiro treino para ver a evolução das cargas aqui." />
      ) : (
        <>
          <div className="row between" style={{ gap: 8 }}>
            <ExerciseChooser
              ex={ex}
              used={used.ids.map((id) => exerciseOrMissing(map, id))}
              last={used.last}
              onPick={(id) => {
                setChosen(id);
                setPicked(null);
              }}
            />
            <Link to={`/exercicio/${ex.id}`} className="small accent-text" style={{ fontWeight: 600, flex: 'none' }}>
              Ver exercício
            </Link>
          </div>

          <div className="col" style={{ gap: 2 }}>
            <span className="small muted">{cardio ? 'Maior tempo no período' : 'Maior carga no período'}</span>
            <span className="display" style={{ fontSize: 40 }}>
              {best !== null ? show(best) : '—'}
            </span>
            {change !== null && (
              <span className="small" style={{ color: change > 0 ? 'var(--success)' : 'var(--text-2)', fontWeight: 700 }}>
                {change > 0 ? `↑ +${show(change)}` : change < 0 ? `↓ −${show(-change)}` : '='} {range.text}
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
            <>
              <TrendChart
                points={points}
                selected={sel}
                onSelect={setPicked}
                axis={(v) => (cardio ? formatDuration(Math.max(0, Math.round(v))) || '0:00' : num(v, 1))}
                unit={cardio ? 60 : 0}
              />
              {points[sel] && (
                <span className="small muted" style={{ textAlign: 'center' }}>
                  {shortDate(points[sel].date)}: <b style={{ color: 'var(--text)' }}>{show(points[sel].value)}</b>
                </span>
              )}
            </>
          ) : (
            <p className="small muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Sem treinos neste período.
            </p>
          )}

          <section className="stack" style={{ gap: 0 }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>
              Histórico
            </h2>
            {recent.map((p) => (
              <Link key={p.itemId} to={`/sessao/${p.sessionId}/resumo`} className="progress-hist-row">
                <span className="small muted" style={{ width: 44, flex: 'none' }}>
                  {dayMonth(p.date)}
                </span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>
                  {setsSummary(p)}
                </span>
                {best !== null && valueOf(p) === best && <Icon name="trophy" size={16} color="var(--record)" />}
                <Icon name="next" size={16} color="var(--muted)" />
              </Link>
            ))}
          </section>
        </>
      )}
      </div>
    </main>
  );
}

/** Nome do exercício com ⌄ (abre a janela) e a janela com busca, recentes e grupos para trocar. */
function ExerciseChooser({ ex, used, last, onPick }: { ex: ExerciseView; used: ExerciseView[]; last: Record<string, string>; onPick: (id: string) => void }) {
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
    <button key={e.id} type="button" className="chooser-row" onClick={() => pick(e.id)}>
      <span className="chooser-thumb">
        <ExerciseThumb exercise={e} />
      </span>
      <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
        <span className="ellipsis" style={{ fontWeight: 600 }}>
          {e.name}
        </span>
        <span className="tiny muted">
          {muscleName(e.primary)}
          {last[e.id] ? ` · ${dayMonth(last[e.id])}` : ''}
        </span>
      </span>
      {e.id === ex.id && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
    </button>
  );

  return (
    <>
      <button type="button" className="chooser-title" onClick={() => setOpen(true)} aria-label={`Exercício: ${ex.name}. Trocar`}>
        <span className="ex-avatar mini">
          <ExerciseThumb exercise={ex} />
        </span>
        <span className="ellipsis">{ex.name}</span>
        <Icon name="down" size={18} color="var(--accent)" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Escolher exercício" subtitle="Só aparecem os que você já fez">
        <label className="search">
          <Icon name="search" size={20} />
          <input type="search" value={query} placeholder="Buscar exercício" aria-label="Buscar exercício" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chooser-list">
          {q ? (
            found.length ? (
              <div className="chooser-group">{found.map(row)}</div>
            ) : (
              <p className="small muted" style={{ padding: '12px 4px' }}>
                Nenhum exercício feito com esse nome.
              </p>
            )
          ) : (
            <>
              <span className="chooser-label">Recentes</span>
              <div className="chooser-group">{recent.map(row)}</div>
              {[...groups.entries()].map(([name, list]) => (
                <div key={name}>
                  <span className="chooser-label">{name}</span>
                  <div className="chooser-group">{list.map(row)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
