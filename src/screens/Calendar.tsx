import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { duration, monthName, num, pad2, relativeDay, sessionMinutes, timeHM, todayISO } from '../lib/format';
import { doneSessions } from '../lib/stats';
import type { Session } from '../lib/types';

const HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function CalendarTabs({ active }: { active: 'cal' | 'hist' }) {
  return (
    <div className="seg">
      {active === 'cal' ? (
        <span className="on" aria-current="page">
          Calendário
        </span>
      ) : (
        <Link to="/calendario">Calendário</Link>
      )}
      {active === 'hist' ? (
        <span className="on" aria-current="page">
          Histórico
        </span>
      ) : (
        <Link to="/historico">Histórico</Link>
      )}
    </div>
  );
}

export function SessionRow({ s }: { s: Session }) {
  const minutes = sessionMinutes(s.startedAt, s.endedAt);
  return (
    <Link to={`/sessao/${s.id}/resumo`} className="list-row">
      <div className="col grow">
        <span className="tiny muted">{relativeDay(s.date)}</span>
        <span style={{ fontWeight: 700 }}>{s.title}</span>
        <span className="small muted">
          {s.startedAt && s.endedAt ? `${timeHM(s.startedAt)} às ${timeHM(s.endedAt)}` : 'Sem horário'}
          {minutes !== null ? ` · ${duration(minutes)}` : ''}
        </span>
      </div>
      {s.manual && <span className="chip dashed">À mão</span>}
      <Icon name="next" size={20} color="#8A8E97" />
    </Link>
  );
}

export function Calendar() {
  const today = todayISO();
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const sessions = useLiveQuery(() => doneSessions(), []);

  const prefix = `${month.y}-${pad2(month.m + 1)}`;
  const monthSessions = (sessions ?? []).filter((s) => s.date.startsWith(prefix));
  const byDate = new Map<string, Session[]>();
  for (const s of sessions ?? []) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const trainedDays = new Set(monthSessions.map((s) => s.date));
  const totalMinutes = monthSessions.reduce((sum, s) => sum + (sessionMinutes(s.startedAt, s.endedAt) ?? 0), 0);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const firstDow = new Date(month.y, month.m, 1).getDay();
  const isCurrentMonth = prefix === today.slice(0, 7);
  const elapsedDays = isCurrentMonth ? Number(today.slice(8)) : daysInMonth;
  const perWeek = elapsedDays > 0 ? (trainedDays.size / elapsedDays) * 7 : 0;

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${prefix}-${pad2(d)}`);

  const shift = (delta: number) => {
    setMonth((cur) => {
      const d = new Date(cur.y, cur.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const selectedSessions = byDate.get(selected) ?? [];

  return (
    <main className="screen tight">
      <h1 className="h1">Calendário</h1>
      <CalendarTabs active="cal" />

      <div className="row between">
        <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => shift(-1)}>
          <Icon name="back" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 800 }}>
          {monthName(month.m).charAt(0).toUpperCase() + monthName(month.m).slice(1)} {month.y}
        </span>
        <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => shift(1)}>
          <Icon name="next" />
        </button>
      </div>

      <div className="grid-3">
        <div className="tile">
          <span className="tiny muted">Treinos</span>
          <span className="tile-value" style={{ fontSize: 26 }}>
            {monthSessions.length}
          </span>
        </div>
        <div className="tile">
          <span className="tiny muted">Tempo total</span>
          <span className="tile-value" style={{ fontSize: 26 }}>
            {totalMinutes > 0 ? duration(totalMinutes) : '—'}
          </span>
        </div>
        <div className="tile">
          <span className="tiny muted">Por semana</span>
          <span className="tile-value" style={{ fontSize: 26 }}>
            {num(perWeek)}
          </span>
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="cal-grid" aria-hidden="true">
          {HEAD.map((h, i) => (
            <span key={i} className="cal-head">
              {h}
            </span>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`b${i}`} />;
            const list = byDate.get(iso) ?? [];
            const timed = list.some((s) => !s.manual);
            const manual = list.length > 0 && !timed;
            const cls = [
              'cal-day',
              timed ? 'trained' : '',
              manual ? 'manual' : '',
              iso === today ? 'today' : '',
              iso === selected ? 'selected' : '',
            ].join(' ');
            const day = Number(iso.slice(8));
            return (
              <button
                type="button"
                key={iso}
                className={cls}
                aria-label={`${day} de ${monthName(month.m)}${list.length ? ', treinou' : ''}`}
                aria-pressed={iso === selected}
                onClick={() => setSelected(iso)}
              >
                <span>{day}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 18 }}>
        <span className="row tiny muted" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)' }} />
          Pelo cronômetro
        </span>
        <span className="row tiny muted" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px dashed var(--accent)' }} />
          Adicionado à mão
        </span>
      </div>

      <section className="stack">
        {selectedSessions.map((s) => (
          <SessionRow key={s.id} s={s} />
        ))}
        <Link to={`/dia/novo?data=${selected}`} className="btn dashed block" style={{ color: 'var(--text)' }}>
          <Icon name="plus" /> {selectedSessions.length ? 'Adicionar outro treino neste dia' : `Adicionar treino em ${relativeDay(selected)}`}
        </Link>
      </section>
    </main>
  );
}
