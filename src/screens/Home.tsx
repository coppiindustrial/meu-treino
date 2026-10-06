import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSlideNavigate } from '../lib/nav';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { LoadingScreen } from '../components/Layout';
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
import type { Session } from '../lib/types';

const FOLDER_KEY = 'mt.homeFolder';
const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export function Home() {
  const go = useSlideNavigate();
  const { prompt } = useDialogs();
  const { map } = useExercises();
  // Dia tocado no cartão "Sua semana" (null: mostra o último treino).
  const [pickedDay, setPickedDay] = useState<string | null>(null);
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

  if (!data) return <LoadingScreen tabs />;
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
  // Dia marcado na semana: o tocado ou, sem toque, o do último treino (se for desta semana).
  const shownDay = pickedDay ?? (lastSession && week.some((d) => d.date === lastSession.date) ? lastSession.date : null);
  const daySessions = pickedDay ? sessions.filter((s) => s.date === pickedDay) : [];
  const dayLabel = pickedDay === today ? 'Hoje' : pickedDay ? DAY_NAMES[week.findIndex((d) => d.date === pickedDay)] ?? '' : '';
  const minutesText = (s: Session) => {
    const m = sessionMinutes(s.startedAt, s.endedAt);
    return m !== null ? ` · ${duration(m)}` : '';
  };

  const newProgram = async () => {
    const name = await prompt({ title: 'Nova rotina', label: 'Nome da rotina', placeholder: 'Hipertrofia · outubro' });
    if (name === null) return;
    const id = await createProgram(name);
    go(`/ficha/${id}`);
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
    go('/sessao');
  };

  return (
    <main className="screen">
      <header className="tab-head">
        <h1 className="h1">Treino</h1>
        <Link to="/perfil" className="glass circle" aria-label="Abrir perfil">
          <Icon name="user" size={21} />
        </Link>
      </header>

      {!program ? (
        <section className="stack">
          <div className="card stack-lg">
            <span className="display" style={{ fontSize: 22 }}>
              Monte sua primeira rotina
            </span>
            <p className="small muted" style={{ lineHeight: 1.5 }}>
              Uma rotina reúne seus treinos (A, B, C…). Depois é só escolher os exercícios de cada um.
            </p>
            <button type="button" className="btn primary block" onClick={newProgram}>
              <Icon name="plus" /> Criar rotina
            </button>
          </div>
          {!active && (
            <button type="button" className="text-link" style={{ alignSelf: 'center' }} onClick={() => start(null)}>
              + Treino vazio
            </button>
          )}
        </section>
      ) : (
        <section className="stack">
          {/* Treino vazio como link ao lado do rótulo (com treino em andamento, ele fica no menu de baixo). */}
          <div className="section-head">
            <span className="label">Rotina ativa</span>
            {!active && (
              <button type="button" className="text-link" onClick={() => start(null)}>
                + Treino vazio
              </button>
            )}
          </div>
          <div className={`folder ${folderOpen ? '' : 'closed'}`}>
            <button type="button" className="folder-head" aria-expanded={folderOpen} onClick={() => toggleFolder()}>
              <Icon name="folder" size={20} color="var(--muted)" />
              <span className="col grow" style={{ gap: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{program.name}</span>
                <span className="tiny muted">
                  {workouts.length} {workouts.length === 1 ? 'treino' : 'treinos'}
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
                    // Treino solto (sem cartão): tocar no nome abre o treino; o botão longo embaixo começa.
                    <div key={w.id} className="routine-line">
                      <Link to={`/treino/${w.id}`} className="routine-line-main">
                        <span className="row between" style={{ gap: 8 }}>
                          <span className="routine-title ellipsis">
                            {w.letter} · {w.name}
                          </span>
                          <Icon name="next" size={18} color="var(--muted)" />
                        </span>
                        <span className="routine-line-list">
                          {items.length === 0
                            ? 'Nenhum exercício ainda'
                            : items.map((it) => map.get(it.exerciseId)?.name ?? 'Exercício').join(', ')}
                        </span>
                      </Link>
                      {!active && items.length > 0 && (
                        <button type="button" className="routine-start" onClick={() => start(w.id)}>
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

      {/* Sua semana: dias, meta, números do mês e o último treino num cartão só. */}
      <section className="card week-card">
        <div className="section-head">
          <h2 className="h2">Sua semana</h2>
          <span className="small muted">
            {weekCount} de {profile.weeklyGoal} da meta
          </span>
        </div>
        {/* Tocar num dia mostra embaixo o que foi feito nele; dias que ainda não chegaram não respondem. */}
        <div className="week-strip">
          {week.map((d, i) => {
            const on = trainedDates.has(d.date);
            const isToday = d.date === today;
            const future = d.date > today;
            return (
              <button
                type="button"
                key={d.date}
                className={`week-day ${d.date === shownDay ? 'sel' : ''}`}
                disabled={future}
                aria-pressed={d.date === shownDay}
                aria-label={`${DAY_NAMES[i]}${on ? ', com treino' : ''}`}
                onClick={() => setPickedDay(d.date)}
              >
                <span style={isToday ? { color: 'var(--text)', fontWeight: 800 } : undefined}>{d.letter}</span>
                <span className={`dot ${on ? 'on' : isToday ? 'today' : ''}`}>
                  {on ? <Icon name="check" size={20} stroke={2.5} /> : Number(d.date.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="week-card-row week-card-stats">
          <span>
            <span className="muted">Mês</span> {monthCount}
          </span>
          <span>
            <span className="muted">Média</span> {avg !== null ? duration(avg) : '—'}
          </span>
          <Link to="/progresso?aba=corpo">
            <span className="muted">Peso</span> {weight !== null ? `${num(weight)} kg` : '—'}
          </Link>
        </div>
        {pickedDay === null ? (
          lastSession && (
            <Link to={`/sessao/${lastSession.id}/resumo`} className="week-card-row week-card-last">
              <span className="muted">Último</span>
              <span className="grow ellipsis">
                {lastSession.title} · {relativeDay(lastSession.date)}
                {minutesText(lastSession)}
              </span>
              <Icon name="next" size={16} color="var(--muted)" />
            </Link>
          )
        ) : daySessions.length === 1 ? (
          <Link to={`/sessao/${daySessions[0].id}/resumo`} className="week-card-row week-card-last">
            <span className="muted">{dayLabel}</span>
            <span className="grow ellipsis">
              {daySessions[0].title}
              {minutesText(daySessions[0])}
            </span>
            <Icon name="next" size={16} color="var(--muted)" />
          </Link>
        ) : daySessions.length > 1 ? (
          <Link to={`/calendario?data=${pickedDay}`} className="week-card-row week-card-last">
            <span className="muted">{dayLabel}</span>
            <span className="grow ellipsis">
              {daySessions[0].title} + {daySessions.length - 1} {daySessions.length - 1 === 1 ? 'treino' : 'treinos'}
            </span>
            <Icon name="next" size={16} color="var(--muted)" />
          </Link>
        ) : (
          <Link to={`/dia/novo?data=${pickedDay}`} className="week-card-row week-card-last">
            <span className="muted">{dayLabel}</span>
            <span className="grow muted">Sem treino neste dia</span>
            <span className="accent-text" style={{ fontWeight: 700 }}>
              Registrar
            </span>
            <Icon name="next" size={16} color="var(--accent)" />
          </Link>
        )}
      </section>
    </main>
  );
}
