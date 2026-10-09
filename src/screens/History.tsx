import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, LoadingScreen, TopBar } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { dayMonth, duration, monthName, sessionMinutes, weekdayShort } from '../lib/format';
import { doneSessions } from '../lib/stats';
import type { Session } from '../lib/types';

export function History() {
  const [programFilter, setProgramFilter] = useState('todas');
  const [filterOpen, setFilterOpen] = useState(false);
  const data = useLiveQuery(async () => {
    const sessions = await doneSessions();
    const programs = (await db.programs.filter((p) => !p.deleted).toArray()).sort((a, b) => b.createdAt - a.createdAt);
    const items = await db.sessionItems.filter((i) => !i.deleted).toArray();
    const exerciseCount: Record<string, number> = {};
    for (const it of items) if (it.done || it.sets.some((s) => s.done)) exerciseCount[it.sessionId] = (exerciseCount[it.sessionId] ?? 0) + 1;
    return { sessions, programs, exerciseCount };
  }, []);

  if (!data) return <LoadingScreen back="/perfil" />;
  const { sessions, programs, exerciseCount } = data;
  const filtered = programFilter === 'todas' ? sessions : sessions.filter((s) => s.programId === programFilter);
  // Quantos treinos e o último de cada rotina (para o menu do filtro).
  const perProgram = new Map<string, { count: number; last: string }>();
  for (const s of sessions) {
    if (!s.programId) continue;
    const cur = perProgram.get(s.programId);
    perProgram.set(s.programId, { count: (cur?.count ?? 0) + 1, last: cur && cur.last > s.date ? cur.last : s.date });
  }
  const filterName = programFilter === 'todas' ? 'Todas as rotinas' : programs.find((p) => p.id === programFilter)?.name ?? 'Rotina';
  const treinos = (n: number) => `${n} ${n === 1 ? 'treino' : 'treinos'}`;
  const pickFilter = (id: string) => {
    setProgramFilter(id);
    setFilterOpen(false);
  };

  // Agrupado por mês (como o Calendário), do mais novo para o mais antigo.
  const groups: { key: string; title: string; list: Session[] }[] = [];
  for (const s of filtered) {
    const key = s.date.slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const name = monthName(Number(key.slice(5, 7)) - 1);
      g = { key, title: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${key.slice(0, 4)}`, list: [] };
      groups.push(g);
    }
    g.list.push(s);
  }

  return (
    <main className="screen no-tabs tight">
      <TopBar left={<BackButton to="/perfil" />} title="Histórico" />

      {/* Filtro de rotina no padrão do Progresso: nome com triângulo e menu de baixo (no lugar da roleta do sistema). */}
      {programs.length > 1 && (
        <div className="col" style={{ gap: 1 }}>
          <button
            type="button"
            className={`chooser-title ${filterOpen ? 'open' : ''}`}
            aria-expanded={filterOpen}
            aria-label={`Filtro: ${filterName}. Trocar`}
            onClick={() => setFilterOpen(true)}
          >
            <span className="ellipsis">{filterName}</span>
            <span className="caret">
              <Icon name="caret" size={13} stroke={2.5} color="var(--accent)" />
            </span>
          </button>
          <span className="tiny muted">{treinos(filtered.length)}</span>
        </div>
      )}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrar por rotina">
        <div className="chooser-list">
          <div className="chooser-group">
            <button type="button" className="chooser-row" onClick={() => pickFilter('todas')}>
              <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>Todas as rotinas</span>
                <span className="tiny muted">{treinos(sessions.length)}</span>
              </span>
              {programFilter === 'todas' && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
            </button>
            {programs.map((p) => {
              const info = perProgram.get(p.id);
              return (
                <button key={p.id} type="button" className="chooser-row" onClick={() => pickFilter(p.id)}>
                  <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="ellipsis" style={{ fontWeight: 600 }}>
                        {p.name}
                      </span>
                      {p.status === 'active' && <span className="chip soft-accent">ativa</span>}
                    </span>
                    <span className="tiny muted">{info ? `${treinos(info.count)} · último ${dayMonth(info.last)}` : 'Nenhum treino ainda'}</span>
                  </span>
                  {programFilter === p.id && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>

      {filtered.length === 0 && (
        <EmptyState title="Nenhum treino registrado" text="Os treinos que você finalizar ou adicionar à mão aparecem aqui." action={{ label: 'Adicionar treino à mão', to: '/dia/novo' }} />
      )}

      {groups.map((g) => {
        const total = g.list.reduce((sum, s) => sum + (sessionMinutes(s.startedAt, s.endedAt) ?? 0), 0);
        return (
          <section key={g.key} className="hist-month">
            {/* Título do mês preso no topo enquanto rola. */}
            <div className="hist-month-head">
              <span>{g.title}</span>
              <span className="tiny muted">
                {g.list.length} {g.list.length === 1 ? 'treino' : 'treinos'}
                {total > 0 ? ` · ${duration(total)}` : ''}
              </span>
            </div>
            <div className="hist-group">
            {g.list.map((s) => {
              const minutes = sessionMinutes(s.startedAt, s.endedAt);
              const count = exerciseCount[s.id] ?? 0;
              return (
                <Link key={s.id} to={`/sessao/${s.id}/resumo`} className="hist-row">
                  <div className="col" style={{ width: 36, minWidth: 36, alignItems: 'center', gap: 0 }}>
                    <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>{Number(s.date.slice(8))}</span>
                    <span className="tiny muted" style={{ fontWeight: 600 }}>
                      {weekdayShort(s.date)}
                    </span>
                  </div>
                  <div className="col grow">
                    <span className="ellipsis" style={{ fontWeight: 700 }}>
                      {s.title}
                    </span>
                    <span className="tiny muted">
                      {minutes !== null ? duration(minutes) : 'Sem cronômetro'}
                      {count > 0 ? ` · ${count} ${count === 1 ? 'exercício' : 'exercícios'}` : ''}
                    </span>
                  </div>
                  {s.manual && <span className="chip dashed">À mão</span>}
                  <Icon name="next" size={18} color="var(--muted)" />
                </Link>
              );
            })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
