import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { db } from '../lib/db';
import { useExercises } from '../lib/exercises';
import {
  addDays,
  duration,
  num,
  relativeDay,
  sessionMinutes,
  todayISO,
  weekStart,
} from '../lib/format';
import {
  createProgram,
  getActiveProgram,
  getActiveSession,
  getProfile,
  itemsOf,
  startSession,
  workoutsOf,
} from '../lib/repo';
import { doneSessions } from '../lib/stats';

const FOLDER_KEY = 'mt.homeFolder';
const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function Home() {
  const navigate = useNavigate();
  const { prompt } = useDialogs();
  const { map } = useExercises();
  const [folderOpen, setFolderOpen] = useState(() => {
    try {
      return localStorage.getItem(FOLDER_KEY) !== 'closed';
    } catch {
      return true;
    }
  });

  const data = useLiveQuery(async () => {
    const [program, sessions, active, profile] = await Promise.all([
      getActiveProgram(),
      doneSessions(),
      getActiveSession(),
      getProfile(),
    ]);
    const workouts = program ? await workoutsOf(program.id) : [];
    const itemsByWorkout = await Promise.all(workouts.map((w) => itemsOf(w.id)));
    const bodies = (await db.bodyEntries.filter((b) => !b.deleted && b.weight !== null).toArray()).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
    return { program, sessions, active, profile, workouts, itemsByWorkout, weight: bodies[0]?.weight ?? null };
  }, []);

  if (!data) return <main className="screen" />;
  const { program, sessions, active, profile, workouts, itemsByWorkout, weight } = data;

  const today = todayISO();
  const monday = weekStart(today);
  const week = WEEK_LETTERS.map((letter, i) => ({ letter, date: addDays(monday, i) }));
  const trainedDates = new Set(sessions.map((s) => s.date));
  const weekCount = week.filter((d) => trainedDates.has(d.date)).length;
  const monthPrefix = today.slice(0, 7);
  const monthCount = sessions.filter((s) => s.date.startsWith(monthPrefix)).length;
  const recentDurations = sessions
    .slice(0, 20)
    .map((s) => sessionMinutes(s.startedAt, s.endedAt))
    .filter((m): m is number => m !== null);
  const avg = recentDurations.length ? recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length : null;
  const lastSession = sessions[0];

  const newProgram = async () => {
    const name = await prompt({ title: 'Nova rotina', label: 'Nome da rotina', placeholder: 'Hipertrofia · outubro' });
    if (name === null) return;
    const id = await createProgram(name);
    navigate(`/ficha/${id}`);
  };

  const toggleFolder = () => {
    const nextOpen = !folderOpen;
    setFolderOpen(nextOpen);
    try {
      localStorage.setItem(FOLDER_KEY, nextOpen ? 'open' : 'closed');
    } catch {
      // sem armazenamento
    }
  };

  const start = async (workoutId: string | null) => {
    await startSession(workoutId);
    navigate('/sessao');
  };

  return (
    <main className="screen">
      <header className="tab-head">
        <h1 className="h1">Treino</h1>
        <Link to="/perfil" className="glass circle" aria-label="Abrir perfil">
          <Icon name="user" size={21} />
        </Link>
      </header>

      {/* Com treino em andamento, ele aparece no menu de baixo (sem repetir aqui). */}
      {!active && (
        <section className="stack">
          <span className="label">Início rápido</span>
          <button type="button" className="btn soft block" onClick={() => start(null)}>
            <Icon name="plus" /> Iniciar treino vazio
          </button>
        </section>
      )}

      {!program ? (
        <section className="card stack-lg">
          <span className="display" style={{ fontSize: 22 }}>
            Monte sua primeira rotina
          </span>
          <p className="small muted" style={{ lineHeight: 1.5 }}>
            Uma rotina reúne seus treinos (A, B, C…). Depois é só escolher os exercícios de cada um.
          </p>
          <button type="button" className="btn primary block" onClick={newProgram}>
            <Icon name="plus" /> Criar rotina
          </button>
        </section>
      ) : (
        <section className="stack">
          <span className="label">Treinos</span>
          <div className={`folder ${folderOpen ? '' : 'closed'}`}>
            <button type="button" className="folder-head" aria-expanded={folderOpen} onClick={() => toggleFolder()}>
              <Icon name="folder" size={20} color="var(--muted)" />
              <span className="col grow" style={{ gap: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{program.name}</span>
                <span className="tiny muted">
                  Rotina ativa · {workouts.length} {workouts.length === 1 ? 'treino' : 'treinos'}
                </span>
              </span>
              <span className="chev">
                <Icon name="down" size={20} />
              </span>
            </button>
            <div className="folder-body">
              <div>
                {workouts.length === 0 && (
                  <Link to={`/ficha/${program.id}`} className="btn soft block">
                    <Icon name="plus" /> Adicionar treino
                  </Link>
                )}
                {workouts.map((w, i) => {
                  const items = itemsByWorkout[i];
                  return (
                    <div key={w.id} className="card routine-card">
                      <Link to={`/treino/${w.id}`} className="row between" style={{ gap: 8 }}>
                        <span className="routine-title ellipsis">
                          {w.letter} · {w.name}
                        </span>
                        <Icon name="next" size={18} color="var(--muted)" />
                      </Link>
                      <p className="routine-list">
                        {items.length === 0
                          ? 'Nenhum exercício ainda'
                          : items.map((it) => map.get(it.exerciseId)?.name ?? 'Exercício').join(', ')}
                      </p>
                      {!active && items.length > 0 && (
                        <button type="button" className="btn primary block" onClick={() => start(w.id)}>
                          Iniciar treino
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="stack">
        <div className="section-head">
          <h2 className="h2">Esta semana</h2>
          <span className="small muted">
            {weekCount} de {profile.weeklyGoal} treinos da meta
          </span>
        </div>
        <div className="week-strip">
          {week.map((d) => {
            const on = trainedDates.has(d.date);
            const isToday = d.date === today;
            return (
              <div key={d.date} className="week-day">
                <span style={isToday ? { color: 'var(--text)', fontWeight: 800 } : undefined}>{d.letter}</span>
                <span className={`dot ${on ? 'on' : isToday ? 'today' : ''}`}>
                  {on ? <Icon name="check" size={20} stroke={2.5} /> : Number(d.date.slice(8))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid-3">
        <div className="tile">
          <span className="tiny muted">Este mês</span>
          <span className="tile-value">{monthCount}</span>
        </div>
        <div className="tile">
          <span className="tiny muted">Tempo médio</span>
          <span className="tile-value">{avg !== null ? duration(avg) : '—'}</span>
        </div>
        <Link to="/progresso/corpo" className="tile" style={{ color: 'var(--text)' }}>
          <span className="tiny muted">Peso atual</span>
          <span className="tile-value">{weight !== null ? `${num(weight)} kg` : '—'}</span>
        </Link>
      </div>

      {lastSession && (
        <Link to={`/sessao/${lastSession.id}/resumo`} className="list-row">
          <div className="letter">{lastSession.title.charAt(0)}</div>
          <div className="col grow">
            <span className="tiny muted">Último treino</span>
            <span className="ellipsis" style={{ fontWeight: 600 }}>
              {lastSession.title} · {relativeDay(lastSession.date)}
              {sessionMinutes(lastSession.startedAt, lastSession.endedAt) !== null
                ? ` · ${duration(sessionMinutes(lastSession.startedAt, lastSession.endedAt)!)}`
                : ''}
            </span>
          </div>
          <Icon name="next" size={20} color="var(--muted)" />
        </Link>
      )}
    </main>
  );
}
