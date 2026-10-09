import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { duration, monthName, num, pad2, relativeDay, sessionMinutes, timeHM, todayISO } from '../lib/format';
import { doneSessions } from '../lib/stats';
import type { Session } from '../lib/types';

const HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

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
      <Icon name="next" size={20} color="var(--muted)" />
    </Link>
  );
}

export function Calendar() {
  const today = todayISO();
  // ?data=AAAA-MM-DD abre o calendário já no dia (ex.: um dia com mais de um treino, tocado no Início).
  const [params] = useSearchParams();
  const asked = params.get('data');
  const start = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  const [month, setMonth] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(start);
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
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const shift = (delta: number) => {
    setMonth((cur) => {
      const d = new Date(cur.y, cur.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const selectedSessions = byDate.get(selected) ?? [];

  return (
    <main className="screen tight">
      <header className="tab-head">
        <h1 className="h1">Calendário</h1>
        <Link to={`/dia/novo?data=${selected}`} className="glass circle" aria-label={`Adicionar treino em ${relativeDay(selected)}`}>
          <Icon name="plus" size={22} stroke={2.4} />
        </Link>
      </header>

      <div className="row between">
        <button type="button" className="glass circle sm" aria-label="Mês anterior" onClick={() => shift(-1)}>
          <Icon name="back" size={18} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 600 }}>
          {monthName(month.m).charAt(0).toUpperCase() + monthName(month.m).slice(1)} {month.y}
        </span>
        <button type="button" className="glass circle sm" aria-label="Próximo mês" onClick={() => shift(1)}>
          <Icon name="next" size={18} />
        </button>
      </div>

      {/* Números do mês em texto, numa linha (como no resumo do treino). */}
      <div className="cal-stats">
        <span>
          <span className="muted">Treinos</span> {monthSessions.length}
        </span>
        <span>
          <span className="muted">Tempo</span> {totalMinutes > 0 ? duration(totalMinutes) : '—'}
        </span>
        <span>
          <span className="muted">Por semana</span> {num(perWeek)}
        </span>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="cal-grid" aria-hidden="true">
          {HEAD.map((h, i) => (
            <span key={i} className="cal-head">
              {h}
            </span>
          ))}
        </div>
        {/* Uma grade por semana, com uma linha fina embaixo de cada uma. */}
        {weeks.map((week, w) => (
        <div key={w} className="cal-grid cal-week">
          {week.map((iso, j) => {
            const i = w * 7 + j;
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
        ))}
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

      <section className="stack">
        <span className="label" style={{ textTransform: 'capitalize' }}>{relativeDay(selected)}</span>
        {selectedSessions.map((s) => (
          <SessionRow key={s.id} s={s} />
        ))}
        {selectedSessions.length === 0 && <p className="small muted">Nenhum treino neste dia. Toque no + lá em cima para adicionar.</p>}
      </section>
    </main>
  );
}
