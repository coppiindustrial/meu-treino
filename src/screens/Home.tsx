import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { db } from '../lib/db';
import { useExercises } from '../lib/exercises';
import {
  addDays,
  clock,
  duration,
  longDate,
  num,
  relativeDay,
  sessionMinutes,
  todayISO,
  weekStart,
} from '../lib/format';
import { useNow } from '../lib/hooks';
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

const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function Home() {
  const navigate = useNavigate();
  const { prompt } = useDialogs();
  const { map } = useExercises();
  const now = useNow(1000);

  const data = useLiveQuery(async () => {
    const [program, sessions, active, profile] = await Promise.all([
      getActiveProgram(),
      doneSessions(),
      getActiveSession(),
      getProfile(),
    ]);
    const workouts = program ? await workoutsOf(program.id) : [];
    let next = workouts[0];
    if (program && workouts.length > 0) {
      const last = sessions.find((s) => s.programId === program.id && s.workoutId);
      if (last) {
        const idx = workouts.findIndex((w) => w.id === last.workoutId);
        if (idx >= 0) next = workouts[(idx + 1) % workouts.length];
      }
    }
    const nextItems = next ? await itemsOf(next.id) : [];
    const lastForNext = next ? sessions.find((s) => s.workoutId === next.id) : undefined;
    const bodies = (await db.bodyEntries.filter((b) => !b.deleted && b.weight !== null).toArray()).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
    return { program, sessions, active, profile, workouts, next, nextItems, lastForNext, weight: bodies[0]?.weight ?? null };
  }, []);

  if (!data) return <main className="screen" />;
  const { program, sessions, active, profile, workouts, next, nextItems, lastForNext, weight } = data;

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
    const name = await prompt({ title: 'Nova ficha', label: 'Nome da ficha', placeholder: 'Hipertrofia · outubro' });
    if (name === null) return;
    const id = await createProgram(name);
    navigate(`/ficha/${id}`);
  };

  const start = async (workoutId: string | null) => {
    await startSession(workoutId);
    navigate('/sessao');
  };

  return (
    <main className="screen">
      <header className="row between">
        <div className="col">
          <span className="small muted">{longDate(today)}</span>
          <h1 className="h1">{profile.name ? `Bora, ${profile.name.split(' ')[0]}` : 'Bora treinar'}</h1>
        </div>
        <Link to="/perfil" className="icon-btn round" aria-label="Abrir perfil">
          <Icon name="user" />
        </Link>
      </header>

      {active ? (
        <section className="card accent stack-lg">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            Treino em andamento
          </span>
          <div className="row">
            <div className="col grow">
              <span className="display" style={{ fontSize: 28 }}>
                {active.title}
              </span>
              <span className="small muted">
                Começou às {new Date(active.startedAt ?? now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <span className="timer-pill">{clock(active.startedAt ? (now - active.startedAt) / 1000 : 0)}</span>
          </div>
          <Link to="/sessao" className="btn big primary">
            Continuar treino
          </Link>
        </section>
      ) : !program ? (
        <section className="card stack-lg">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            Comece por aqui
          </span>
          <span className="display" style={{ fontSize: 28 }}>
            Monte sua primeira ficha
          </span>
          <p className="small muted" style={{ lineHeight: 1.5 }}>
            Uma ficha reúne seus treinos (A, B, C…). Depois é só escolher os exercícios de cada um.
          </p>
          <button type="button" className="btn big primary" onClick={newProgram}>
            <Icon name="plus" /> Criar ficha
          </button>
          <button type="button" className="text-btn muted" onClick={() => start(null)}>
            Ou comece um treino livre agora
          </button>
        </section>
      ) : !next ? (
        <section className="card stack-lg">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            {program.name}
          </span>
          <span className="display" style={{ fontSize: 28 }}>
            Adicione os treinos da ficha
          </span>
          <Link to={`/ficha/${program.id}`} className="btn big primary">
            <Icon name="plus" /> Adicionar treino
          </Link>
        </section>
      ) : (
        <section className="card stack-lg">
          <div className="row between">
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>
              Próximo treino
            </span>
            <span className="tiny muted">{lastForNext ? `Último: ${relativeDay(lastForNext.date)}` : 'Ainda não feito'}</span>
          </div>
          <Link to={`/treino/${next.id}`} className="row" style={{ color: 'var(--text)' }}>
            <div className="letter big on">{next.letter}</div>
            <div className="col grow">
              <span className="display" style={{ fontSize: 28, fontWeight: 600 }}>
                {next.name}
              </span>
              <span className="small muted">
                {nextItems.length} {nextItems.length === 1 ? 'exercício' : 'exercícios'} · {program.name}
              </span>
            </div>
          </Link>
          {nextItems.length > 0 && (
            <p className="small muted" style={{ lineHeight: 1.5 }}>
              {nextItems
                .slice(0, 6)
                .map((it) => map.get(it.exerciseId)?.name ?? 'Exercício')
                .join(', ')}
              {nextItems.length > 6 ? '…' : ''}
            </p>
          )}
          <button type="button" className="btn big primary" onClick={() => start(next.id)}>
            <Icon name="play" size={18} /> Iniciar treino
          </button>
          {workouts.length > 1 && (
            <Link to="/treinos" className="text-btn muted" style={{ alignSelf: 'center', display: 'flex', alignItems: 'center' }}>
              Escolher outro treino
            </Link>
          )}
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
          <Icon name="next" size={20} color="#8A8E97" />
        </Link>
      )}
    </main>
  );
}
