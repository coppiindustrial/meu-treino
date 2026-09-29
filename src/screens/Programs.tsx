import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { dayMonth, fullDate, toISODate } from '../lib/format';
import { activateProgram, createProgram, createWorkout } from '../lib/repo';
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
  const others = programs.filter((p) => p.status !== 'active');
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
    const name = await prompt({ title: 'Nova ficha', label: 'Nome da ficha', placeholder: 'Hipertrofia · outubro' });
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
        ? `A ficha "${active.name}" será encerrada. O histórico dela continua guardado.`
        : 'Ela passa a definir o seu próximo treino.',
      confirmLabel: 'Ativar ficha',
    });
    if (!ok) return;
    await activateProgram(p.id);
    toast('Ficha ativada');
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
        <button type="button" className="glass circle" aria-label="Nova ficha" onClick={newProgram}>
          <Icon name="plus" size={22} stroke={2.4} />
        </button>
      </header>

      {programs.length === 0 ? (
        <EmptyState
          title="Nenhuma ficha ainda"
          text="Uma ficha reúne os treinos que você está seguindo (A, B, C…). Deixe as próximas prontas e ative quando for trocar."
          action={{ label: 'Criar minha primeira ficha', onClick: newProgram }}
        />
      ) : (
        <p className="small muted" style={{ lineHeight: 1.5 }}>
          A ficha ativa define o seu próximo treino. Deixe as próximas prontas e ative quando for trocar.
        </p>
      )}

      {active && (
        <section className="card accent" style={{ paddingBottom: 4 }}>
          <div className="row between" style={{ alignItems: 'flex-start', paddingBottom: 10 }}>
            <div className="col">
              <span className="chip accent eyebrow" style={{ fontSize: 11 }}>
                Ficha ativa
              </span>
              <span className="display" style={{ fontSize: 20 }}>
                {active.name}
              </span>
              <span className="tiny muted">
                {active.startedAt ? `Desde ${dayMonth(toISODate(new Date(active.startedAt)))} · ` : ''}
                {sessionCount(active.id)} {sessionCount(active.id) === 1 ? 'treino feito' : 'treinos feitos'}
              </span>
            </div>
            <Link to={`/ficha/${active.id}`} className="text-btn">
              Editar
            </Link>
          </div>
          {workoutsOf(active.id).map(workoutRow)}
          <button type="button" className="card-row-btn" onClick={() => addWorkout(active.id)}>
            <Icon name="plus" /> Adicionar treino
          </button>
        </section>
      )}

      {others.length > 0 && (
        <section className="stack">
          <div className="section-head">
            <h2 className="h2">Outras fichas</h2>
            <span className="small muted">Prontas ou antigas</span>
          </div>
          {others.map((p) => {
            const ws = workoutsOf(p.id);
            const status =
              p.status === 'ready'
                ? `Pronta para usar · ${ws.length} ${ws.length === 1 ? 'treino' : 'treinos'}`
                : `Encerrada${p.endedAt ? ` em ${fullDate(toISODate(new Date(p.endedAt)))}` : ''} · ${sessionCount(p.id)} no histórico`;
            return (
              <div key={p.id} className="list-row" style={{ padding: '10px 10px 10px 16px' }}>
                <Link to={`/ficha/${p.id}`} className="col grow" style={{ color: 'var(--text)' }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  <span className="tiny muted">{status}</span>
                </Link>
                <button type="button" className="btn small outline-accent" onClick={() => activate(p)}>
                  Ativar
                </button>
              </div>
            );
          })}
        </section>
      )}

      <Link to="/exercicios" className="list-row">
        <span className="notice-icon">
          <Icon name="book" />
        </span>
        <span className="col grow">
          <span style={{ fontWeight: 700 }}>Biblioteca de exercícios</span>
          <span className="tiny muted">Animações, fotos e passo a passo</span>
        </span>
        <Icon name="next" size={20} color="var(--muted)" />
      </Link>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Nova ficha">
        <div className="list-group">
          <button type="button" className="list-item" style={{ minHeight: 64 }} onClick={newEmptyProgram}>
            <span className="notice-icon">
              <Icon name="plus" />
            </span>
            <span className="col grow">
              <span style={{ fontSize: 16, fontWeight: 600 }}>Criar do zero</span>
              <span className="tiny muted">Monte as rotinas escolhendo os exercícios</span>
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
              <span className="tiny muted">Cole o texto e o app monta a ficha sozinho</span>
            </span>
          </button>
        </div>
      </Sheet>
    </main>
  );
}
