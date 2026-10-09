import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { addDays, duration, fromISODate, monthName, pad2, relativeDay, sessionMinutes, timeHM, toISODate, todayISO } from '../lib/format';
import { scrollPositions } from '../lib/nav';
import { getProfile } from '../lib/repo';
import { doneSessions } from '../lib/stats';
import type { Session } from '../lib/types';

const HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function SessionRow({ s, showDate = true }: { s: Session; showDate?: boolean }) {
  const minutes = sessionMinutes(s.startedAt, s.endedAt);
  return (
    <Link to={`/sessao/${s.id}/resumo`} className="list-row">
      <div className="col grow">
        {showDate && <span className="tiny muted">{relativeDay(s.date)}</span>}
        <span style={{ fontWeight: 700 }}>{s.title}</span>
        <span className="small muted">
          {s.startedAt && s.endedAt ? `${timeHM(s.startedAt)} às ${timeHM(s.endedAt)}` : 'Sem horário'}
          {minutes !== null ? ` · ${duration(minutes)}` : ''}
        </span>
      </div>
      {s.manual && <span className="chip dashed">À mão</span>}
      <Icon name="next" size={20} color="var(--muted)" />
    </Link>
  );
}

/** "2026-10" → "2026-09" (delta = -1). */
function shiftMonth(ym: string, delta: number): string {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Domingo da semana do dia (o calendário começa a semana no domingo). */
function sundayOf(iso: string): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function Calendar() {
  const today = todayISO();
  const location = useLocation();
  const navType = useNavigationType();
  // ?data=AAAA-MM-DD: o dia aberto no menu de baixo (fica no endereço para voltar com ele aberto).
  const [params, setParams] = useSearchParams();
  const asked = params.get('data');
  const openDay = asked && ISO_DAY.test(asked) ? asked : null;
  const data = useLiveQuery(async () => ({ sessions: await doneSessions(), profile: await getProfile() }), []);

  const sessions = data?.sessions ?? [];
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  // Meses seguidos, do primeiro treino (pelo menos 2 meses para trás) até o mês atual.
  const current = today.slice(0, 7);
  let first = shiftMonth(current, -2);
  for (const s of sessions) if (s.date.slice(0, 7) < first) first = s.date.slice(0, 7);
  if (openDay && openDay.slice(0, 7) < first) first = openDay.slice(0, 7);
  const months: string[] = [];
  for (let ym = first; ym <= current; ym = shiftMonth(ym, 1)) months.push(ym);

  // Sequência: semanas seguidas batendo a meta (a semana atual só conta depois de bater).
  const daysByWeek = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.date > today) continue;
    const wk = sundayOf(s.date);
    const set = daysByWeek.get(wk) ?? new Set<string>();
    set.add(s.date);
    daysByWeek.set(wk, set);
  }
  const goal = Math.max(1, data?.profile.weeklyGoal ?? 1);
  const hit = (wk: string) => (daysByWeek.get(wk)?.size ?? 0) >= goal;
  let streak = 0;
  let wk = sundayOf(today);
  if (hit(wk)) streak++;
  for (wk = addDays(wk, -7); hit(wk); wk = addDays(wk, -7)) streak++;
  const lastDate = sessions.map((s) => s.date).filter((d) => d <= today).sort().pop();
  const restDays = lastDate ? Math.round((fromISODate(today).getTime() - fromISODate(lastDate).getTime()) / 86400000) : null;

  // Abre no mês do dia pedido (ou no atual), menos ao voltar para cá: aí a rolagem salva é que vale.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current) return;
    scrolled.current = true;
    if (navType === 'POP' && scrollPositions.has(location.key)) return;
    const target = document.querySelector(`[data-month="${(openDay ?? today).slice(0, 7)}"]`);
    target?.scrollIntoView({ block: 'start' });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDay = (iso: string | null) => setParams(iso ? { data: iso } : {}, { replace: true });
  // Enquanto o menu fecha, ele continua mostrando o último dia aberto.
  const lastDay = useRef(openDay);
  if (openDay) lastDay.current = openDay;
  const shownDay = openDay ?? lastDay.current;
  const daySessions = shownDay ? byDate.get(shownDay) ?? [] : [];

  return (
    <main className="screen tight">
      <header className="tab-head">
        <h1 className="h1">Calendário</h1>
        <Link to={`/dia/novo?data=${today}`} className="glass circle" aria-label="Adicionar treino">
          <Icon name="plus" size={22} stroke={2.4} />
        </Link>
      </header>

      {/* Como no Hevy: semanas seguidas na meta e dias desde o último treino. */}
      <div className="cal-streak">
        <span>
          <Icon name="flame" size={16} color="#ff8a3d" />
          {streak} {streak === 1 ? 'semana' : 'semanas'} na meta
        </span>
        <span>
          <Icon name="moon" size={15} color="var(--accent)" />
          {restDays === null ? 'Nenhum treino ainda' : restDays === 0 ? 'Treinou hoje' : `${restDays} ${restDays === 1 ? 'dia' : 'dias'} de descanso`}
        </span>
      </div>

      <div className="cal-dows" aria-hidden="true">
        {HEAD.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>

      <div className="cal-months">
        {months.map((ym) => {
          const y = Number(ym.slice(0, 4));
          const m = Number(ym.slice(5, 7)) - 1;
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          const firstDow = new Date(y, m, 1).getDay();
          const count = sessions.filter((s) => s.date.startsWith(ym)).length;
          const cells: (string | null)[] = [];
          for (let i = 0; i < firstDow; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${pad2(d)}`);
          return (
            <section key={ym} className="cal-month" data-month={ym}>
              <div className="cal-month-title">
                <span>
                  {capitalize(monthName(m))} de {y}
                </span>
                {count > 0 && (
                  <span className="tiny muted">
                    {count} {count === 1 ? 'treino' : 'treinos'}
                  </span>
                )}
              </div>
              {/* Linha fina em cima de cada dia: as semanas se separam e quebram na virada do mês. */}
              <div className="cal-hgrid">
                {cells.map((iso, i) => {
                  if (!iso) return <span key={`b${i}`} />;
                  const list = byDate.get(iso) ?? [];
                  const timed = list.some((s) => !s.manual);
                  const manual = list.length > 0 && !timed;
                  const future = iso > today;
                  const day = Number(iso.slice(8));
                  const cls = ['cal-hday', timed ? 'trained' : '', manual ? 'manual' : '', iso === today ? 'today' : '', iso === openDay ? 'selected' : '', future ? 'future' : ''].join(' ');
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={cls}
                      disabled={future}
                      aria-label={`${day} de ${monthName(m)}${list.length ? `, ${list.map((s) => s.title).join(', ')}` : ''}`}
                      onClick={() => pickDay(iso)}
                    >
                      <span className="cal-hnum">{day}</span>
                      {list.length > 0 && (
                        <span className="cal-hlabel">
                          {list[0].title}
                          {list.length > 1 ? ` +${list.length - 1}` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="row" style={{ gap: 18 }}>
        <span className="row tiny muted" style={{ gap: 6 }}>
          <span className="cal-legend-dot" style={{ background: 'var(--accent)' }} />
          Pelo cronômetro
        </span>
        <span className="row tiny muted" style={{ gap: 6 }}>
          <span className="cal-legend-dot" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} />
          Adicionado à mão
        </span>
      </div>

      <Sheet open={openDay !== null} onClose={() => pickDay(null)} title={shownDay ? capitalize(relativeDay(shownDay)) : ''}>
        <div className="stack" style={{ gap: 8, marginTop: 6 }}>
          {daySessions.map((s) => (
            <SessionRow key={s.id} s={s} showDate={false} />
          ))}
          {daySessions.length === 0 && <p className="small muted">Nenhum treino neste dia.</p>}
          {shownDay && shownDay <= today && (
            <Link to={`/dia/novo?data=${shownDay}`} className="list-row accent-text" style={{ fontWeight: 600 }}>
              <Icon name="plus" size={20} stroke={2.4} />
              <span className="grow">Adicionar treino neste dia</span>
            </Link>
          )}
        </div>
      </Sheet>
    </main>
  );
}
