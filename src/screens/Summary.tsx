import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useSlideNavigate } from '../lib/nav';
import { Duration } from '../components/Duration';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, LoadingScreen, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { MuscleBadge } from '../components/MuscleBadge';
import { prevSetText } from '../components/SetRow';
import { db } from '../lib/db';
import { loadText, setLabels } from '../lib/equipment';
import { exerciseOrMissing, useExercises, type ExerciseView } from '../lib/exercises';
import { longDate, num, plural, sessionMinutes, timeHM } from '../lib/format';
import { sessionItemsOf, updateSession } from '../lib/repo';
import { cardioSetText, cardioTotals, distText, formatDuration, isCardio } from '../lib/cardio';
import { bestSet, sessionRecords, summarize, type RecordHit } from '../lib/stats';
import type { Session, SessionItem } from '../lib/types';

type View = 'lista' | 'detalhado';
const LS_VIEW = 'mt.summaryView';

function readView(): View {
  try {
    return localStorage.getItem(LS_VIEW) === 'detalhado' ? 'detalhado' : 'lista';
  } catch {
    return 'lista';
  }
}

export function Summary() {
  const { sessionId = '' } = useParams();
  const go = useSlideNavigate();
  const { map } = useExercises();
  const [view, setView] = useState<View>(readView);

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.deleted) return { session: undefined };
    const items = await sessionItemsOf(sessionId);
    const records = session.status === 'done' ? await sessionRecords(session, items) : [];
    return { session, items, records };
  }, [sessionId]);

  const [note, setNote] = useState('');
  useEffect(() => {
    setNote(data?.session?.note ?? '');
  }, [data?.session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tela abre no topo quando o conteúdo chega. A volta ao topo da troca de tela acontece ainda no
  // "carregando", e a rolagem/foco que sobrava levava a tela até a anotação.
  const loaded = !!data;
  useLayoutEffect(() => {
    if (!loaded) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    window.scrollTo(0, 0);
  }, [loaded]);

  if (!data) return <LoadingScreen back="/historico" />;
  const { session, items = [], records = [] } = data;
  if (!session) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton to="/historico" />} />
        <EmptyState title="Treino não encontrado" action={{ label: 'Ver histórico', to: '/historico' }} />
      </main>
    );
  }
  if (session.status === 'active') return <Navigate to="/sessao" replace />;

  const minutes = sessionMinutes(session.startedAt, session.endedAt);
  const stats = summarize(items);
  const planItems = items.filter((it) => !it.extra).length;
  const justFinished = !session.manual && !!session.endedAt && Date.now() - session.endedAt < 15 * 60 * 1000;
  const recordOf = new Map(records.map((r) => [r.exerciseId, r]));

  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(LS_VIEW, v);
    } catch {
      // sem armazenamento
    }
  };

  // Números em texto, só os que existem neste treino.
  const facts: { label: string; value: string; extra?: string }[] = [
    { label: 'Séries', value: String(stats.setsDone), extra: stats.warmupsDone > 0 ? `+${stats.warmupsDone} aq.` : undefined },
  ];
  if (stats.volume > 0) facts.push({ label: 'Volume', value: `${num(stats.volume, 0)} kg` });
  if (stats.plateVolume > 0) facts.push({ label: 'Placas', value: `${num(stats.plateVolume, 0)} ×reps` });
  if (stats.km > 0 || stats.cardioSecs > 0) {
    facts.push({ label: 'Cardio', value: [stats.cardioSecs > 0 ? formatDuration(stats.cardioSecs) : '', stats.km > 0 ? `${num(stats.km, 2)} km` : ''].filter(Boolean).join(' · ') });
  }

  return (
    <main className="screen no-tabs">
      {!justFinished && (
        <TopBar
          left={<BackButton to="/historico" />}
          right={
            <Link to={`/dia/${session.id}`} className="glass pill">
              Editar
            </Link>
          }
        />
      )}

      <div className="col" style={{ gap: 2, marginTop: justFinished ? 16 : 0 }}>
        {justFinished && (
          <span className="sum-done">
            <span className="sum-done-icon">
              <Icon name="check" size={13} stroke={3} />
            </span>
            Treino concluído
          </span>
        )}
        <h1 className="display" style={{ fontSize: 26 }}>
          {session.title}
        </h1>
        <span className="small muted">
          {longDate(session.date)}
          {session.startedAt && session.endedAt ? ` · ${timeHM(session.startedAt)}–${timeHM(session.endedAt)}` : ''}
          {session.manual ? ' · registrado à mão' : ''}
        </span>
      </div>

      <section className="sum-stats" aria-label="Números do treino">
        <div className="sum-hero">
          <span className="sum-dur">{minutes !== null ? <Duration minutes={minutes} /> : '—'}</span>
          <span className="small">
            {stats.planExercises}/{planItems} {planItems === 1 ? 'exercício' : 'exercícios'}
            {stats.extraExercises > 0 && <span className="muted"> +{stats.extraExercises} extra</span>}
          </span>
        </div>
        <div className="sum-grid">
          {facts.map((f) => (
            <span key={f.label}>
              <span className="muted">{f.label}</span> {f.value}
              {f.extra && <span className="st-a"> {f.extra}</span>}
            </span>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <>
          <div className="seg sliding" role="tablist" aria-label="Como ver os exercícios">
            <span className="seg-bubble" aria-hidden="true" style={{ transform: view === 'detalhado' ? 'translateX(calc(100% + 4px))' : 'none' }} />
            <button type="button" role="tab" aria-selected={view === 'lista'} className={view === 'lista' ? 'on' : ''} onClick={() => pickView('lista')}>
              Lista
            </button>
            <button type="button" role="tab" aria-selected={view === 'detalhado'} className={view === 'detalhado' ? 'on' : ''} onClick={() => pickView('detalhado')}>
              Detalhado
            </button>
          </div>

          {view === 'lista' ? (
            <div className="sum-rows fade-in" key="lista">
              {items.map((it) => (
                <ListRow key={it.id} it={it} ex={exerciseOrMissing(map, it.exerciseId)} session={session} record={recordOf.get(it.exerciseId)} />
              ))}
            </div>
          ) : (
            <div className="sum-detail fade-in" key="detalhado">
              {items.map((it) => (
                <DetailBlock key={it.id} it={it} ex={exerciseOrMissing(map, it.exerciseId)} session={session} record={recordOf.get(it.exerciseId)} />
              ))}
            </div>
          )}
        </>
      )}

      <label className="field">
        <span className="label">Como foi o treino?</span>
        <textarea
          className="textarea"
          value={note}
          placeholder="Anotação livre"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (session.note ?? '')) void updateSession(session.id, { note: note.trim() });
          }}
        />
      </label>

      {justFinished && (
        <div className="stack">
          <button type="button" className="btn big primary block" onClick={() => go('/', { dir: 'back', replace: true })}>
            Concluir
          </button>
          <Link to={`/dia/${session.id}`} className="btn block">
            <Icon name="pencil" size={18} /> Ajustar data ou horário
          </Link>
        </div>
      )}
    </main>
  );
}

/** Séries feitas, aquecimentos e séries além das planejadas de um exercício do treino. */
function itemParts(it: SessionItem, session: Session) {
  const done = it.sets.filter((s) => s.done && s.type !== 'A');
  const warmups = it.sets.filter((s) => s.done && s.type === 'A');
  // Séries a mais só fazem sentido num treino de ficha e num exercício que veio dela: conta as
  // séries de trabalho além das planejadas (incluir um aquecimento não vira "série extra").
  const planned = it.sets.filter((s) => !s.extra).length;
  const extraSets = session.workoutId && !it.extra ? Math.max(0, done.length - planned) : 0;
  return { done, warmups, extraSets };
}

/** Selos ao lado do nome: extra, séries extras e recorde. */
function Badges({ it, extraSets, record, recordDetail = false }: { it: SessionItem; extraSets: number; record?: RecordHit; recordDetail?: boolean }) {
  return (
    <>
      {it.extra && <span className="chip soft-accent">Extra</span>}
      {extraSets > 0 && <span className="chip neutral">+{plural(extraSets, 'série extra', 'séries extras')}</span>}
      {record && <span className="chip record-badge">{recordDetail ? `Recorde · antes ${loadText(record.previous, record.unit)}` : 'Recorde'}</span>}
    </>
  );
}

/** Linha da lista, no mesmo visual da ficha: foto, músculos, nome e o que foi feito. */
function ListRow({ it, ex, session, record }: { it: SessionItem; ex: ExerciseView; session: Session; record?: RecordHit }) {
  const { done, warmups, extraSets } = itemParts(it, session);
  const b = bestSet(it.sets);
  const cardio = isCardio(it.logType);
  const totals = cardioTotals(it.sets, it.distUnit ?? 'km');
  const text =
    done.length > 0 && cardio
      ? [totals.km ? `${num(totals.km, 2)} km` : '', totals.secs ? formatDuration(totals.secs) : '', `${done.length} ${it.logType === 'tiros' ? (done.length === 1 ? 'tiro' : 'tiros') : done.length === 1 ? 'série' : 'séries'}`].filter(Boolean).join(' · ')
      : done.length > 0
        ? `${done.length} × ${[...new Set(done.map((s) => s.reps ?? 0))].join('/')}${b.load !== null ? ` · ${loadText(b.load, it.unit)}` : ''}`
        : it.done
          ? 'Feito'
          : 'Não feito';
  const did = it.done || done.length > 0 || warmups.length > 0;
  return (
    <div className="ex-row">
      <Link to={`/exercicio/${it.exerciseId}`} className="ex-row-link">
        <span className="ex-photo" style={did ? undefined : { opacity: 0.5 }}>
          <ExerciseThumb exercise={ex} />
          <MuscleBadge primary={ex.primary} secondary={ex.secondary} />
        </span>
        <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="ex-row-name" style={did ? undefined : { color: 'var(--muted)' }}>
              {ex.name}
            </span>
            <Badges it={it} extraSets={extraSets} record={record} />
          </span>
          <span className="small muted">{text}</span>
          {warmups.length > 0 && (
            <span className="small st-a">
              + {plural(warmups.length, 'aquecimento', 'aquecimentos')} ·{' '}
              {warmups.map((s) => (cardio ? cardioSetText(s, it.distUnit ?? 'km') : `${loadText(s.load, it.unit) || '—'} × ${s.reps ?? '—'}`)).join(', ')}
            </span>
          )}
        </span>
      </Link>
      <Icon name="next" size={18} color="var(--muted)" />
    </div>
  );
}

/** Vista detalhada: as séries feitas numa tabela limpa, com as mesmas colunas do treino. */
function DetailBlock({ it, ex, session, record }: { it: SessionItem; ex: ExerciseView; session: Session; record?: RecordHit }) {
  const { extraSets } = itemParts(it, session);
  const logType = it.logType ?? ex.logType;
  const distUnit = it.distUnit ?? ex.distUnit;
  const cardio = isCardio(logType);
  const withDist = cardio && logType !== 'tempo';
  const labels = setLabels(it.sets.map((s) => s.type));
  const rows = it.sets.map((s, i) => ({ s, label: labels[i] })).filter((r) => r.s.done);
  const cols = cardio ? (withDist ? 'c-tk' : 'c-t') : '';
  const valueLabel = it.unit === 'placa' ? 'Placa' : it.unit;
  return (
    <section className="sum-block">
      <Link to={`/exercicio/${it.exerciseId}`} className="sum-ex-head">
        <span className="sum-ex-thumb">
          <ExerciseThumb exercise={ex} />
        </span>
        <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="ex-row-name">{ex.name}</span>
            <Badges it={it} extraSets={extraSets} record={record} recordDetail />
          </span>
          {it.note ? <span className="tiny muted">{it.note}</span> : null}
        </span>
      </Link>
      {rows.length === 0 ? (
        <p className="small muted sum-none">{it.done ? 'Feito' : 'Não feito'}</p>
      ) : (
        <div className={`sum-table ${cols}`}>
          <div className="sum-row head">
            <span>Série</span>
            <span>Anterior</span>
            {cardio ? (
              <>
                {withDist && <span>{distUnit}</span>}
                <span>Tempo</span>
              </>
            ) : (
              <>
                <span>{valueLabel}</span>
                <span>Reps</span>
              </>
            )}
          </div>
          {rows.map(({ s, label }, i) => {
            const warm = s.type === 'A';
            const prev = prevSetText(cardio ? { secs: s.prevSecs, dist: s.prevDist } : { load: s.prevLoad, reps: s.prevReps }, it.unit, cardio ? logType : 'carga', distUnit);
            return (
              <div key={i} className={`sum-row ${warm ? 'warm' : ''}`}>
                <span className={warm ? 'st-a' : 'muted'}>{label}</span>
                <span className="muted ellipsis">{prev}</span>
                {cardio ? (
                  <>
                    {withDist && <span>{s.dist !== null && s.dist !== undefined ? distText(s.dist, distUnit).replace(/ (km|m)$/, '') : '—'}</span>}
                    <span>{formatDuration(s.secs) || '—'}</span>
                  </>
                ) : (
                  <>
                    <span>{s.load !== null && s.load !== undefined ? num(s.load, 2) : '—'}</span>
                    <span>{s.reps ?? '—'}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
