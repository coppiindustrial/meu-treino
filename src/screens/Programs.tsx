import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/Layout';
import { LongPressSort } from '../components/LongPressSort';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { dayMonth, fullDate, toISODate } from '../lib/format';
import { activateProgram, createProgram, createWorkout, reorderPrograms } from '../lib/repo';
import { doneSessions } from '../lib/stats';
import type { Program, Workout } from '../lib/types';

export function Programs() {
  const navigate = useNavigate();
  const { prompt, confirm, toast } = useDialogs();
  const [newOpen, setNewOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const programs = (await db.programs.filter((p) => !p.deleted).toArray()).sort((a, b) => b.createdAt - a.createdAt);
    const workouts = await db.workouts.filter((w) => !w.deleted).toArray();
    const items = await db.workoutItems.filter((i) => !i.deleted).toArray();
    const sessions = await doneSessions();
    return { programs, workouts, items, sessions };
  }, []);

  if (!data) return <main className="screen" />;
  const { programs, workouts, items, sessions } = data;
  const active = programs.find((p) => p.status === 'active');
  const others = programs
    .filter((p) => p.status !== 'active')
    .sort((a, b) => (a.position ?? -1) - (b.position ?? -1) || b.createdAt - a.createdAt);
  const itemCount = (wId: string) => items.filter((i) => i.workoutId === wId).length;
  const workoutsOf = (pId: string) => workouts.filter((w) => w.programId === pId).sort((a, b) => a.position - b.position);
  const sessionCount = (pId: string) => sessions.filter((s) => s.programId === pId).length;
  const lastDone = (wId: string) => sessions.find((s) => s.workoutId === wId);

  let nextId: string | undefined;
  if (active) {
    const ws = workoutsOf(active.id);
    const last = sessions.find((s) => s.programId === active.id && s.workoutId);
    const idx = last ? ws.findIndex((w) => w.id === last.workoutId) : -1;
    nextId = ws.length ? ws[(idx + 1) % ws.length].id : undefined;
  }

  const newProgram = () => setNewOpen(true);

  const newEmptyProgram = async () => {
    setNewOpen(false);
    const name = await prompt({ title: 'Nova rotina', label: 'Nome da rotina', placeholder: 'Hipertrofia · outubro' });
    if (name === null) return;
    const id = await createProgram(name);
    navigate(`/ficha/${id}`);
  };

  const addWorkout = async (programId: string) => {
    const name = await prompt({ title: 'Novo treino', label: 'Nome do treino', placeholder: 'Peito e tríceps' });
    if (name === null) return;
    const id = await createWorkout(programId, name.trim() || 'Novo treino');
    navigate(`/treino/${id}`);
  };

  const activate = async (p: Program) => {
    const ok = await confirm({
      title: `Ativar "${p.name}"?`,
      message: active
        ? `A rotina "${active.name}" será encerrada. O histórico dela continua guardado.`
        : 'Ela passa a definir o seu próximo treino.',
      confirmLabel: 'Ativar rotina',
    });
    if (!ok) return;
    await activateProgram(p.id);
    toast('Rotina ativada');
  };

  const workoutRow = (w: Workout) => {
    const last = lastDone(w.id);
    const count = itemCount(w.id);
    const isNext = w.id === nextId;
    return (
      <Link key={w.id} to={`/treino/${w.id}`} className="row" style={{ minHeight: 62, padding: '8px 4px', borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
        <div className={`letter ${isNext ? 'on' : ''}`}>{w.letter}</div>
        <div className="col grow">
          <div className="row" style={{ gap: 8 }}>
            <span className="ellipsis" style={{ fontWeight: 700 }}>
              {w.name}
            </span>
            {isNext && <span className="chip accent">Próximo</span>}
          </div>
          <span className="tiny muted">
            {count} {count === 1 ? 'exercício' : 'exercícios'}
            {last ? ` · feito em ${dayMonth(last.date)}` : ''}
          </span>
        </div>
        <Icon name="next" size={20} color="var(--muted)" />
      </Link>
    );
  };

  return (
    <main className="screen">
      <header className="tab-head">
        <h1 className="h1">Treinos</h1>
        <div className="actions">
          <Link to="/exercicios?buscar=1" className="glass circle" aria-label="Buscar exercício">
            <Icon name="search" size={21} />
          </Link>
          <button type="button" className="glass circle" aria-label="Nova rotina" onClick={newProgram}>
            <Icon name="plus" size={22} stroke={2.4} />
          </button>
        </div>
      </header>

      {programs.length === 0 ? (
        <EmptyState
          title="Nenhuma rotina ainda"
          text="Uma rotina reúne os treinos que você está seguindo (A, B, C…). Deixe as próximas prontas e ative quando for trocar."
          action={{ label: 'Criar minha primeira rotina', onClick: newProgram }}
        />
      ) : (
        <p className="small muted" style={{ lineHeight: 1.5 }}>
          A rotina ativa define o seu próximo treino. Deixe as próximas prontas e ative quando for trocar.
        </p>
      )}

      {active && (
        <section className="card accent" style={{ paddingBottom: 4 }}>
          <Link to={`/ficha/${active.id}`} className="tap-head row between" aria-label={`Abrir a rotina ${active.name}`}>
            <span className="col" style={{ minWidth: 0 }}>
              <span className="display ellipsis" style={{ fontSize: 20 }}>
                {active.name}
              </span>
              <span className="tiny muted">
                {active.startedAt ? `Desde ${dayMonth(toISODate(new Date(active.startedAt)))} · ` : ''}
                {sessionCount(active.id)} {sessionCount(active.id) === 1 ? 'treino feito' : 'treinos feitos'}
              </span>
            </span>
            <span className="active-tag">
              <i aria-hidden="true" />
              Ativa
            </span>
          </Link>
          {workoutsOf(active.id).map(workoutRow)}
          <button type="button" className="card-row-btn" onClick={() => addWorkout(active.id)}>
            <Icon name="plus" /> Adicionar treino
          </button>
        </section>
      )}

      {others.length > 0 && (
        <section className="stack">
          <div className="section-head">
            <h2 className="h2">Outras rotinas</h2>
            <span className="small muted">{others.length > 1 ? 'Segure para mudar a ordem' : 'Prontas ou antigas'}</span>
          </div>
          <LongPressSort ids={others.map((p) => p.id)} onReorder={(ids) => void reorderPrograms(ids)}>
            {(id) => {
              const p = others.find((x) => x.id === id)!;
              const ws = workoutsOf(p.id);
              const status =
                p.status === 'ready'
                  ? `Pronta para usar · ${ws.length} ${ws.length === 1 ? 'treino' : 'treinos'}`
                  : `Encerrada${p.endedAt ? ` em ${fullDate(toISODate(new Date(p.endedAt)))}` : ''} · ${sessionCount(p.id)} no histórico`;
              return (
                <div className="list-row" style={{ padding: 6 }}>
                  <Link to={`/ficha/${p.id}`} className="tap-head col grow" aria-label={`Abrir a rotina ${p.name}`}>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    <span className="tiny muted">{status}</span>
                  </Link>
                  <button type="button" className="btn small outline-accent" onClick={() => activate(p)}>
                    Ativar
                  </button>
                </div>
              );
            }}
          </LongPressSort>
        </section>
      )}

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Nova rotina">
        <div className="list-group">
          <button type="button" className="list-item" style={{ minHeight: 64 }} onClick={newEmptyProgram}>
            <span className="notice-icon">
              <Icon name="plus" />
            </span>
            <span className="col grow">
              <span style={{ fontSize: 16, fontWeight: 600 }}>Criar do zero</span>
              <span className="tiny muted">Monte os treinos escolhendo os exercícios</span>
            </span>
          </button>
          <button
            type="button"
            className="list-item"
            style={{ minHeight: 64 }}
            onClick={() => {
              setNewOpen(false);
              navigate('/treinos/colar');
            }}
          >
            <span className="notice-icon">
              <Icon name="copy" />
            </span>
            <span className="col grow">
              <span style={{ fontSize: 16, fontWeight: 600 }}>Colar treino pronto</span>
              <span className="tiny muted">Cole o texto e o app monta a rotina sozinho</span>
            </span>
          </button>
        </div>
      </Sheet>
    </main>
  );
}
