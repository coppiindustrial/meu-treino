import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { EmptyState, LoadingScreen } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { useRest } from '../components/RestTimer';
import { IntervalConfigButtons, TirosRunner } from '../components/Intervals';
import { RestSheet, SetRow, SetTypeSheet } from '../components/SetRow';
import { SwipeRow } from '../components/SwipeRow';
import { LogTypePicker } from '../components/LogTypePicker';
import { Sheet } from '../components/Sheet';
import { isCardio, logTypeName } from '../lib/cardio';
import { db } from '../lib/db';
import { UNITS, setLabels } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { num, pad2 } from '../lib/format';
import { useNow, useWakeLock } from '../lib/hooks';
import {
  addSet,
  deleteSession,
  finishSession,
  getActiveSession,
  getProfile,
  moveSessionItem,
  removeSessionItem,
  removeSet,
  sessionItemsOf,
  setSessionItemDone,
  setItemDistUnit,
  setItemLogType,
  setSessionItemUnit,
  toggleSessionSuperset,
  updateSessionItem,
  updateSet,
} from '../lib/repo';
import { summarize } from '../lib/stats';
import type { DoneSet, SessionItem } from '../lib/types';
import { groupSupersets, restText } from '../lib/workout';

function elapsedText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  if (h > 0) return `${h}h ${pad2(m)}min`;
  return `${m}min ${pad2(s % 60)}s`;
}

export function ActiveSession() {
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const rest = useRest();
  const { map } = useExercises();
  const now = useNow(1000);
  const [typeMenu, setTypeMenu] = useState<{ itemId: string; index: number } | null>(null);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const session = await getActiveSession();
    const items = session ? await sessionItemsOf(session.id) : [];
    const workout = session?.workoutId ? await db.workouts.get(session.workoutId) : undefined;
    const profile = await getProfile();
    return { session, items, workout, profile };
  }, []);
  useWakeLock(!!data?.session);

  if (!data) return <LoadingScreen back="/" />;
  const { session, items, workout, profile } = data;
  if (!session) {
    return (
      <main className="screen no-tabs session-screen">
        <EmptyState title="Nenhum treino em andamento" text="Comece um treino pela tela Início." action={{ label: 'Ir para o Início', to: '/' }} />
      </main>
    );
  }

  const defaultRest = workout?.restSeconds ?? profile.restSeconds;
  const restOf = (it: SessionItem) => it.restSeconds ?? defaultRest;
  const stats = summarize(items);
  const elapsed = session.startedAt ? (now - session.startedAt) / 1000 : 0;
  const groups = groupSupersets(items);

  const onToggleSet = async (it: SessionItem, index: number, s: DoneSet, values: Partial<DoneSet>) => {
    const willBeDone = !s.done;
    await updateSet(it.id, index, { ...values, done: willBeDone });
    if (!willBeDone) return;
    const group = groups.find((g) => g.some((x) => x.id === it.id)) ?? [it];
    const pos = group.findIndex((x) => x.id === it.id);
    if (group.length > 1 && pos < group.length - 1) {
      toast(`Agora: ${exerciseOrMissing(map, group[pos + 1].exerciseId).name}`);
      return;
    }
    const seconds = restOf(it);
    if (seconds > 0) rest.start(seconds, nextText(it, index));
  };

  /** Texto do aviso de fim do descanso: a próxima série deste exercício ou o próximo exercício. */
  const nextText = (it: SessionItem, index: number): string => {
    if (it.sets.some((x, j) => j !== index && !x.done)) return `Próxima série: ${exerciseOrMissing(map, it.exerciseId).name}`;
    const next = items.find((x) => x.id !== it.id && !x.done && x.sets.some((y) => !y.done));
    return next ? `Próximo exercício: ${exerciseOrMissing(map, next.exerciseId).name}` : 'Hora de continuar o treino.';
  };

  const finish = async () => {
    const empty = items.filter((i) => !i.sets.some((s) => s.done) && !i.done).length;
    if (items.length === 0 || empty > 0) {
      const ok = await confirm({
        title: 'Finalizar o treino?',
        message:
          items.length === 0 || empty === items.length
            ? 'Nenhuma série foi marcada.'
            : `${empty} ${empty === 1 ? 'exercício ficou' : 'exercícios ficaram'} sem nenhuma série marcada.`,
        confirmLabel: 'Finalizar treino',
      });
      if (!ok) return;
    }
    await finishSession(session.id);
    rest.stop();
    navigate(`/sessao/${session.id}/resumo`, { replace: true });
  };

  const discard = async () => {
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

  const menuItem = items.find((i) => i.id === menuFor);
  const menuIndex = menuItem ? items.indexOf(menuItem) : -1;
  const typeItem = typeMenu ? items.find((i) => i.id === typeMenu.itemId) : undefined;
  const typeSet = typeItem && typeMenu ? typeItem.sets[typeMenu.index] : undefined;
  const restItem = items.find((i) => i.id === restFor);

  const card = (it: SessionItem) => {
    const ex = exerciseOrMissing(map, it.exerciseId);
    const labels = setLabels(it.sets.map((s) => s.type));
    const unitLabel = it.unit === 'placa' ? 'Placa' : it.unit;
    const logType = it.logType ?? ex.logType;
    const distUnit = it.distUnit ?? ex.distUnit;
    const cardio = isCardio(logType);
    return (
      <section key={it.id} className="ex-card">
        <div className="ex-head">
          <Link to={`/exercicio/${it.exerciseId}`} className="ex-title">
            <span className="ex-avatar">
              <ExerciseThumb exercise={ex} />
            </span>
            <span className="ex-name">{ex.name}</span>
          </Link>
          <button
            type="button"
            className={`check-circle sm ${it.done ? 'on' : ''}`}
            aria-pressed={it.done}
            aria-label={it.done ? `Desmarcar ${ex.name}` : `Marcar todas as séries de ${ex.name}`}
            onClick={() => setSessionItemDone(it.id, !it.done)}
          >
            <Icon name="check" size={18} stroke={3} className="check-draw" />
          </button>
          <button type="button" className="icon-btn ghost" aria-label={`Opções de ${ex.name}`} onClick={() => setMenuFor(it.id)}>
            <Icon name="more" />
          </button>
        </div>
        <NoteField item={it} />
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {cardio && <span className="log-tag">{logTypeName(logType)}</span>}
          {logType !== 'tiros' && (
            <button type="button" className="rest-link" onClick={() => setRestFor(it.id)}>
              <Icon name="timer" size={16} /> Descanso: {restText(restOf(it))}
            </button>
          )}
        </div>
        {logType === 'tiros' && (
          <div className="stack">
            <IntervalConfigButtons value={it.interval} onChange={(interval) => updateSessionItem(it.id, { interval })} />
            <TirosRunner itemId={it.id} config={it.interval} onFinished={(n) => toast(`${n} tiros concluídos`)} />
          </div>
        )}
        <div className="sets">
          {(logType !== 'tiros' || it.sets.length > 0) && (
            <div className={`set-row head ${cardio ? (logType === 'tempo' ? 'c-t' : 'c-tk') : ''}`}>
              <span style={{ textAlign: 'center' }}>{logType === 'tiros' ? 'Tiro' : 'Série'}</span>
              <span>Anterior</span>
              {!cardio && <span style={{ textAlign: 'center' }}>{unitLabel}</span>}
              {!cardio && <span style={{ textAlign: 'center' }}>Reps</span>}
              {cardio && logType !== 'tempo' && <span style={{ textAlign: 'center' }}>{distUnit}</span>}
              {cardio && <span style={{ textAlign: 'center' }}>Tempo</span>}
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <Icon name="check" size={14} stroke={3} />
              </span>
            </div>
          )}
          {it.sets.map((s, i) => (
            <SwipeRow key={i} onDelete={() => removeSet(it.id, i)}>
              <SetRow
                label={labels[i]}
                set={s}
                unit={it.unit}
                logType={logType}
                distUnit={distUnit}
                onOpenMenu={() => setTypeMenu({ itemId: it.id, index: i })}
                onCommit={(changes) => updateSet(it.id, i, changes)}
                onToggle={(values) => onToggleSet(it, i, s, values)}
              />
            </SwipeRow>
          ))}
          {logType !== 'tiros' && (
            <button type="button" className="btn soft small block" onClick={() => addSet(it.id)}>
              <Icon name="plus" /> Adicionar série
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <main className="screen no-tabs tight">
      <div className="topbar sticky-top">
        <Link to="/" data-nav="back" className="glass circle" aria-label="Recolher o treino (ele continua)">
          <Icon name="down" size={22} />
        </Link>
        <span className="topbar-title col" style={{ gap: 0, alignItems: 'center', minWidth: 0 }}>
          <span>Registrar treino</span>
          <span className="tiny muted ellipsis" style={{ maxWidth: '100%', fontWeight: 500 }}>
            {session.title}
          </span>
        </span>
        <button type="button" className="pill-primary" onClick={finish}>
          Concluir
        </button>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns: `repeat(${stats.volume > 0 && stats.km > 0 ? 4 : 3}, minmax(0, 1fr))` }}>
        <div>
          <span>Duração</span>
          <b style={{ color: 'var(--accent)' }}>{elapsedText(elapsed)}</b>
        </div>
        {(stats.volume > 0 || stats.km === 0) && (
          <div>
            <span>Volume</span>
            <b>{num(stats.volume, 0)} kg</b>
          </div>
        )}
        {stats.km > 0 && (
          <div>
            <span>Distância</span>
            <b>{num(stats.km, 2)} km</b>
          </div>
        )}
        <div>
          <span>Séries</span>
          <b>{stats.setsDone}</b>
        </div>
      </div>

      {items.length === 0 && <EmptyState title="Treino livre" text="Adicione os exercícios conforme for fazendo." />}

      {groups.map((g) =>
        g.length === 1 ? (
          card(g[0])
        ) : (
          <div key={g[0].id} className="ss-group">
            <span className="ss-label">Superset</span>
            {g.map(card)}
          </div>
        ),
      )}

      <Link to="/sessao/adicionar" className="btn small primary block">
        <Icon name="plus" /> Adicionar exercício
      </Link>
      <button type="button" className="btn block danger" style={{ border: 0 }} onClick={discard}>
        Descartar treino
      </button>

      <SetTypeSheet
        open={!!typeMenu}
        onClose={() => setTypeMenu(null)}
        current={typeSet?.type}
        subtitle={typeItem ? exerciseOrMissing(map, typeItem.exerciseId).name : undefined}
        onPick={async (t) => {
          if (typeMenu) await updateSet(typeMenu.itemId, typeMenu.index, { type: t });
          setTypeMenu(null);
        }}
        onRemove={async () => {
          if (typeMenu) await removeSet(typeMenu.itemId, typeMenu.index);
          setTypeMenu(null);
        }}
      />

      <RestSheet
        open={!!restItem}
        onClose={() => setRestFor(null)}
        value={restItem ? restOf(restItem) : defaultRest}
        onPick={async (s) => {
          if (restItem) await updateSessionItem(restItem.id, { restSeconds: s });
          setRestFor(null);
        }}
      />

      <Sheet open={!!menuItem} onClose={() => setMenuFor(null)} title={menuItem ? exerciseOrMissing(map, menuItem.exerciseId).name : undefined}>
        {menuItem && (
          <>
            <LogTypePicker
              value={menuItem.logType ?? exerciseOrMissing(map, menuItem.exerciseId).logType}
              distUnit={menuItem.distUnit ?? exerciseOrMissing(map, menuItem.exerciseId).distUnit}
              onType={(t) => setItemLogType('sessionItems', menuItem.id, menuItem.exerciseId, t)}
              onDistUnit={(u) => setItemDistUnit('sessionItems', menuItem.id, menuItem.exerciseId, u)}
            />
            {!isCardio(menuItem.logType ?? exerciseOrMissing(map, menuItem.exerciseId).logType) && (
            <div className="field">
              <span className="label">Anotar a carga em</span>
              <div className="seg">
                {UNITS.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className={menuItem.unit === u.id ? 'on' : ''}
                    aria-pressed={menuItem.unit === u.id}
                    onClick={() => setSessionItemUnit(menuItem.id, menuItem.exerciseId, u.id)}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
            )}
            <div className="list-group">
              <Link to={`/exercicio/${menuItem.exerciseId}`} className="list-item" onClick={() => setMenuFor(null)}>
                <Icon name="chart" color="var(--text-2)" />
                <span className="grow">Ver exercício e progresso</span>
              </Link>
              {menuIndex > 0 && (
                <button type="button" className="list-item" onClick={() => moveSessionItem(session.id, menuIndex, menuIndex - 1)}>
                  <Icon name="up" color="var(--text-2)" />
                  <span className="grow">Mover para cima</span>
                </button>
              )}
              {menuIndex < items.length - 1 && (
                <button type="button" className="list-item" onClick={() => moveSessionItem(session.id, menuIndex, menuIndex + 1)}>
                  <Icon name="down" color="var(--text-2)" />
                  <span className="grow">Mover para baixo</span>
                </button>
              )}
              {menuIndex < items.length - 1 && (
                <button
                  type="button"
                  className="list-item"
                  onClick={async () => {
                    await toggleSessionSuperset(menuItem.id);
                    setMenuFor(null);
                  }}
                >
                  <Icon name="link" color="var(--text-2)" />
                  <span className="grow">{menuItem.supersetNext ? 'Separar do superset' : 'Fazer superset com o próximo'}</span>
                </button>
              )}
              <button
                type="button"
                className="list-item danger"
                onClick={async () => {
                  const ok = await confirm({ title: 'Tirar este exercício do treino?', confirmLabel: 'Tirar', danger: true });
                  if (!ok) return;
                  await removeSessionItem(menuItem.id);
                  setMenuFor(null);
                }}
              >
                <Icon name="trash" />
                <span className="grow">Tirar do treino</span>
              </button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}

function NoteField({ item }: { item: SessionItem }) {
  const [note, setNote] = useState(item.note ?? '');
  useEffect(() => setNote(item.note ?? ''), [item.note]);
  return (
    <input
      className="ex-note"
      value={note}
      placeholder="Adicionar anotação…"
      aria-label="Anotação do exercício"
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => {
        if (note !== (item.note ?? '')) void updateSessionItem(item.id, { note: note.trim() });
      }}
    />
  );
}

