import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/Layout';
import { useRest } from '../components/RestTimer';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { loadText } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { clock } from '../lib/format';
import { useNow, useWakeLock } from '../lib/hooks';
import {
  deleteSession,
  finishSession,
  getActiveSession,
  getProfile,
  moveSessionItem,
  removeSessionItem,
  sessionItemsOf,
  setSessionItemDone,
  updateSession,
} from '../lib/repo';
import type { SessionItem } from '../lib/types';
import { groupSupersets } from './WorkoutDetail';

export function ActiveSession() {
  const navigate = useNavigate();
  const { confirm, prompt } = useDialogs();
  const rest = useRest();
  const { map } = useExercises();
  const now = useNow(1000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reorder, setReorder] = useState(false);

  const data = useLiveQuery(async () => {
    const session = await getActiveSession();
    const items = session ? await sessionItemsOf(session.id) : [];
    const workout = session?.workoutId ? await db.workouts.get(session.workoutId) : undefined;
    const profile = await getProfile();
    return { session, items, workout, profile };
  }, []);
  useWakeLock(!!data?.session);

  if (!data) return <main className="screen no-tabs" />;
  const { session, items, workout, profile } = data;
  if (!session) {
    return (
      <main className="screen no-tabs">
        <EmptyState title="Nenhum treino em andamento" text="Comece um treino pela tela Início." action={{ label: 'Ir para o Início', to: '/' }} />
      </main>
    );
  }

  const restSeconds = workout?.restSeconds ?? profile.restSeconds;
  const doneCount = items.filter((i) => i.done).length;
  const nextIdx = items.findIndex((i) => !i.done);
  const elapsed = session.startedAt ? (now - session.startedAt) / 1000 : 0;

  const finish = async () => {
    const missing = items.length - doneCount;
    if (missing > 0) {
      const ok = await confirm({
        title: 'Finalizar o treino?',
        message:
          doneCount === 0
            ? 'Nenhum exercício foi marcado como feito.'
            : `Faltam ${missing} ${missing === 1 ? 'exercício' : 'exercícios'}. Eles ficam registrados como não feitos.`,
        confirmLabel: 'Finalizar treino',
      });
      if (!ok) return;
    }
    await finishSession(session.id);
    rest.stop();
    navigate(`/sessao/${session.id}/resumo`, { replace: true });
  };

  const discard = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Descartar este treino?',
      message: 'Tudo que foi marcado nele será apagado e ele não entra no calendário.',
      confirmLabel: 'Descartar treino',
      danger: true,
    });
    if (!ok) return;
    await deleteSession(session.id);
    rest.stop();
    navigate('/', { replace: true });
  };

  const rename = async () => {
    setMenuOpen(false);
    const title = await prompt({ title: 'Nome do treino', initial: session.title });
    if (title !== null && title.trim()) await updateSession(session.id, { title: title.trim() });
  };

  const row = (it: SessionItem, idx: number) => {
    const ex = exerciseOrMissing(map, it.exerciseId);
    const setsDone = it.sets.filter((s) => s.done).length;
    const loads = it.sets.map((s) => s.load).filter((l): l is number => l !== null);
    const detail = `${setsDone}/${it.sets.length} séries${loads.length ? ` · ${loadText(Math.max(...loads), it.unit)}` : ''}`;
    const isNext = idx === nextIdx;
    const cls = it.done ? 'done' : isNext ? 'next' : '';
    return (
      <div key={it.id} className={`session-row ${cls}`}>
        {reorder ? (
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="icon-btn" style={{ width: 40, minWidth: 40 }} aria-label={`Subir ${ex.name}`} onClick={() => moveSessionItem(session.id, idx, idx - 1)}>
              <Icon name="up" size={18} stroke={2.5} />
            </button>
            <button type="button" className="icon-btn" style={{ width: 40, minWidth: 40 }} aria-label={`Descer ${ex.name}`} onClick={() => moveSessionItem(session.id, idx, idx + 1)}>
              <Icon name="down" size={18} stroke={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`check-circle ${it.done ? 'on' : isNext ? 'next' : ''}`}
            aria-label={it.done ? `Desmarcar ${ex.name}` : `Marcar ${ex.name} como feito`}
            aria-pressed={it.done}
            onClick={() => setSessionItemDone(it.id, !it.done)}
          >
            {it.done && <Icon name="check" size={22} stroke={2.5} />}
          </button>
        )}
        <Link to={`/sessao/item/${it.id}`} className="col grow" style={{ color: it.done ? 'var(--muted)' : 'var(--text)' }}>
          <span className="name">{ex.name}</span>
          <span className="small" style={{ color: it.done ? 'var(--muted)' : 'var(--text-2)' }}>
            {detail}
            {it.note ? ` · ${it.note}` : ''}
          </span>
        </Link>
        {reorder ? (
          <button type="button" className="icon-btn ghost" style={{ width: 36, minWidth: 36, color: 'var(--danger)' }} aria-label={`Tirar ${ex.name} deste treino`} onClick={() => removeSessionItem(it.id)}>
            <Icon name="trash" size={18} />
          </button>
        ) : isNext && !it.done ? (
          <span className="badge-next">Próximo</span>
        ) : null}
      </div>
    );
  };

  const groups = groupSupersets(items);
  let running = 0;

  return (
    <main className="screen no-tabs">
      <div className="topbar">
        <Link to="/" className="back" style={{ color: 'var(--text-2)' }}>
          <Icon name="back" />
          Início
        </Link>
        <span className="timer-pill">
          <Icon name="clock" size={16} color="#C6F36B" />
          {clock(elapsed)}
        </span>
        <button type="button" className="icon-btn ghost" aria-label="Mais opções" onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </div>

      <div className="col">
        <span className="small muted">{session.title}</span>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <span className="display" style={{ fontSize: 52 }}>
            {doneCount} de {items.length}
          </span>
          <span className="muted">exercícios feitos</span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="progress-bars" aria-hidden="true">
          {items.map((it) => (
            <span key={it.id} className={it.done ? 'on' : ''} />
          ))}
        </div>
      )}

      {items.length === 0 && (
        <EmptyState title="Treino livre" text="Adicione os exercícios conforme for fazendo." />
      )}

      <div className="stack">
        {groups.map((g) => {
          const start = running;
          running += g.length;
          const rows = g.map((it, k) => row(it, start + k));
          if (g.length === 1) return rows;
          return (
            <div key={g[0].id} className="superset">
              <div className="superset-head">
                <Icon name="link" size={16} />
                <span className="eyebrow" style={{ fontSize: 12 }}>
                  Superset
                </span>
                <span className="tiny muted">um após o outro, descanse no fim</span>
              </div>
              {rows}
            </div>
          );
        })}
      </div>

      {reorder ? (
        <button type="button" className="btn block soft" onClick={() => setReorder(false)}>
          Pronto
        </button>
      ) : (
        <Link to="/sessao/adicionar" className="btn dashed block">
          <Icon name="plus" /> Adicionar exercício
        </Link>
      )}

      <div className="notice" style={{ alignItems: 'center' }}>
        <Icon name="timer" color="#A3A6AD" />
        <div className="col grow">
          <span style={{ fontWeight: 700 }}>Descanso de {restSeconds} s</span>
          <span className="tiny muted">Começa sozinho quando você marca uma série</span>
        </div>
        <button type="button" className="btn small" onClick={() => rest.start(restSeconds)}>
          Iniciar
        </button>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <button type="button" className="btn big light grow" onClick={finish}>
            <Icon name="flag" /> Finalizar treino
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Opções do treino">
        <div className="list-group">
          <button type="button" className="list-item" onClick={() => { setMenuOpen(false); setReorder(true); }}>
            <Icon name="list" color="#A3A6AD" />
            <span className="grow">Mudar ordem ou tirar exercícios</span>
          </button>
          <button type="button" className="list-item" onClick={rename}>
            <Icon name="pencil" color="#A3A6AD" />
            <span className="grow">Renomear treino</span>
          </button>
          <button type="button" className="list-item danger" onClick={discard}>
            <Icon name="trash" />
            <span className="grow">Descartar treino</span>
          </button>
        </div>
      </Sheet>
    </main>
  );
}
