import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { db } from '../lib/db';
import { loadText } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { duration, longDate, num, sessionMinutes, timeHM } from '../lib/format';
import { sessionItemsOf, updateSession } from '../lib/repo';
import { bestSet, sessionRecords, summarize } from '../lib/stats';

export function Summary() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { map } = useExercises();

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

  if (!data) return <main className="screen no-tabs" />;
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
  const justFinished = !session.manual && !!session.endedAt && Date.now() - session.endedAt < 15 * 60 * 1000;

  return (
    <main className="screen no-tabs">
      {!justFinished && (
        <TopBar
          left={<BackButton to="/historico" />}
          right={
            <Link to={`/dia/${session.id}`} className="text-btn" style={{ display: 'flex', alignItems: 'center' }}>
              Editar
            </Link>
          }
        />
      )}
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, marginTop: justFinished ? 24 : 0 }}>
        {justFinished && (
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={38} stroke={2.5} />
          </div>
        )}
        <h1 className="display" style={{ fontSize: justFinished ? 42 : 34, marginTop: justFinished ? 8 : 0 }}>
          {justFinished ? 'Treino concluído' : session.title}
        </h1>
        {justFinished && <span style={{ fontWeight: 700 }}>{session.title}</span>}
        <span className="small muted">
          {longDate(session.date)}
          {session.startedAt && session.endedAt ? ` · das ${timeHM(session.startedAt)} às ${timeHM(session.endedAt)}` : ''}
          {session.manual ? ' · registrado à mão' : ''}
        </span>
      </div>

      <div className="grid-2">
        <div className="tile">
          <span className="tiny muted">Duração</span>
          <span className="tile-value">{minutes !== null ? duration(minutes) : '—'}</span>
        </div>
        <div className="tile">
          <span className="tiny muted">Exercícios</span>
          <span className="tile-value">
            {stats.exercisesDone} de {items.length}
          </span>
        </div>
        <div className="tile">
          <span className="tiny muted">Séries feitas</span>
          <span className="tile-value">{stats.setsDone}</span>
        </div>
        <div className="tile">
          <span className="tiny muted">Volume total</span>
          <span className="tile-value">{stats.volume > 0 ? `${num(stats.volume, 0)} kg` : '—'}</span>
        </div>
      </div>

      {records.map((r) => (
        <div key={r.exerciseId} className="notice" style={{ background: '#221A14', borderColor: 'var(--orange-border)' }}>
          <span className="notice-icon" style={{ background: '#3A2A1C', color: 'var(--record)' }}>
            <Icon name="trophy" />
          </span>
          <div className="col">
            <span className="eyebrow" style={{ color: 'var(--record)', fontSize: 11 }}>
              Novo recorde
            </span>
            <span style={{ fontWeight: 700 }}>
              {exerciseOrMissing(map, r.exerciseId).name}: {loadText(r.load, r.unit)}
              {r.reps ? ` × ${r.reps}` : ''}
            </span>
            <span className="small muted">Antes: {loadText(r.previous, r.unit)}</span>
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <section className="stack">
          <h2 className="h2">Exercícios</h2>
          <div className="list-group">
            {items.map((it) => {
              const ex = exerciseOrMissing(map, it.exerciseId);
              const done = it.sets.filter((s) => s.done && s.type !== 'A');
              const b = bestSet(it.sets);
              const text =
                done.length > 0
                  ? `${done.length} × ${[...new Set(done.map((s) => s.reps ?? 0))].join('/')}${b.load !== null ? ` · ${loadText(b.load, it.unit)}` : ''}`
                  : it.done
                    ? 'Feito'
                    : 'Não feito';
              return (
                <Link key={it.id} to={`/exercicio/${it.exerciseId}`} className="list-item">
                  <span className="grow col">
                    <span style={{ fontWeight: 700, color: it.done || done.length ? 'var(--text)' : 'var(--muted)' }}>{ex.name}</span>
                    <span className="tiny muted">{text}</span>
                  </span>
                  <Icon name="next" size={18} color="#8A8E97" />
                </Link>
              );
            })}
          </div>
        </section>
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
          <button type="button" className="btn big primary block" onClick={() => navigate('/', { replace: true })}>
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
