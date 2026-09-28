import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Sparkline } from '../components/Charts';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { ExerciseMedia } from '../components/Media';
import { useRest } from '../components/RestTimer';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { SET_TYPE_BY_ID, SET_TYPES, loadText, setLabels } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { clock, num, parseNum } from '../lib/format';
import { useNow, useWakeLock } from '../lib/hooks';
import { muscleName } from '../lib/muscles';
import {
  addSet,
  getProfile,
  lastDoneItemFor,
  removeSet,
  sessionItemsOf,
  setSessionItemDone,
  setSessionItemDoneFlag,
  setSessionItemUnit,
  updateSet,
} from '../lib/repo';
import { bestSet, exerciseHistory } from '../lib/stats';
import type { DoneSet, LoadUnit, SetType } from '../lib/types';
import { groupSupersets } from './WorkoutDetail';

const NEXT_UNIT: Record<LoadUnit, LoadUnit> = { kg: 'placa', placa: 'lb', lb: 'kg' };

export function SessionExercise() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const rest = useRest();
  const { map } = useExercises();
  const now = useNow(1000);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);

  const data = useLiveQuery(async () => {
    const item = await db.sessionItems.get(itemId);
    if (!item || item.deleted) return { item: undefined };
    const session = await db.sessions.get(item.sessionId);
    const items = await sessionItemsOf(item.sessionId);
    const prev = await lastDoneItemFor(item.exerciseId, item.sessionId);
    const history = await exerciseHistory(item.exerciseId);
    const workout = session?.workoutId ? await db.workouts.get(session.workoutId) : undefined;
    const profile = await getProfile();
    return { item, session, items, prev, history, workout, profile };
  }, [itemId]);
  useWakeLock(true);

  if (!data) return <main className="screen no-tabs" />;
  const { item, session, items = [], prev, history = [], workout, profile } = data;
  if (!item || !session) return <Navigate to="/sessao" replace />;
  if (session.status === 'done') return <Navigate to={`/sessao/${session.id}/resumo`} replace />;

  const ex = exerciseOrMissing(map, item.exerciseId);
  const index = items.findIndex((i) => i.id === item.id);
  const restSeconds = workout?.restSeconds ?? profile?.restSeconds ?? 90;
  const group = groupSupersets(items).find((g) => g.some((i) => i.id === item.id)) ?? [item];
  const inSuperset = group.length > 1;
  const posInGroup = group.findIndex((i) => i.id === item.id);
  const nextInGroup = inSuperset ? group[(posInGroup + 1) % group.length] : undefined;
  const labels = setLabels(item.sets.map((s) => s.type));
  const prevBest = prev ? bestSet(prev.sets) : null;
  const sparkValues = history.filter((h) => h.unit === item.unit && h.best !== null).slice(-8).map((h) => h.best as number);
  const unitLabel = item.unit === 'placa' ? 'Placa' : item.unit;

  const onToggle = async (i: number, s: DoneSet, load: number | null, reps: number | null) => {
    const willBeDone = !s.done;
    await updateSet(item.id, i, { load, reps, done: willBeDone });
    if (!willBeDone) return;
    if (inSuperset && posInGroup < group.length - 1 && nextInGroup) {
      toast(`Agora: ${exerciseOrMissing(map, nextInGroup.exerciseId).name}`);
      return;
    }
    rest.start(restSeconds);
  };

  const conclude = async () => {
    if (item.sets.some((s) => s.done)) await setSessionItemDoneFlag(item.id, true);
    else await setSessionItemDone(item.id, true);
    const after = items.slice(index + 1).find((i) => !i.done && i.id !== item.id);
    const before = items.slice(0, index).find((i) => !i.done);
    const next = after ?? before;
    if (next) navigate(`/sessao/item/${next.id}`, { replace: true });
    else navigate('/sessao', { replace: true });
  };

  const menuSet = menuIdx !== null ? item.sets[menuIdx] : undefined;

  return (
    <main className="screen no-tabs tight">
      <div className="topbar">
        <Link to="/sessao" className="back">
          <Icon name="back" />
          Lista
        </Link>
        <span className="small muted" style={{ fontWeight: 700 }}>
          Exercício {index + 1} de {items.length}
        </span>
        <span className="timer-pill" style={{ background: 'none', padding: 0 }}>
          <Icon name="clock" size={16} color="#C6F36B" />
          {clock(session.startedAt ? (now - session.startedAt) / 1000 : 0)}
        </span>
      </div>

      <ExerciseMedia exercise={ex} height={170} />

      <div className="stack" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30 }}>
          {ex.name}
        </h1>
        <div className="pills">
          <span className="chip neutral">{muscleName(ex.primary)}</span>
          {item.note ? <span className="chip method">{item.note}</span> : null}
        </div>
      </div>

      {inSuperset && nextInGroup && (
        <Link to={`/sessao/item/${nextInGroup.id}`} className="superset" style={{ color: 'var(--text)' }}>
          <div className="superset-head">
            <Icon name="link" size={16} />
            <span className="eyebrow" style={{ fontSize: 12 }}>
              Superset
            </span>
            <span className="tiny muted">faça uma série de cada, sem descanso</span>
          </div>
          <div className="row" style={{ padding: '2px 4px 4px' }}>
            <span className="grow small">
              {posInGroup < group.length - 1 ? 'Depois desta série: ' : 'Volte para: '}
              <strong>{exerciseOrMissing(map, nextInGroup.exerciseId).name}</strong>
            </span>
            <Icon name="next" size={18} />
          </div>
        </Link>
      )}

      <Link to={`/exercicio/${ex.id}`} className="list-row" style={{ padding: '12px 12px 12px 14px' }}>
        <div className="col grow">
          <span className="tiny muted">
            {prev ? 'Última vez' : 'Primeira vez neste exercício'}
            {prevBest?.load !== null && prevBest?.load !== undefined ? ` · melhor ${loadText(prevBest.load, prev?.unit ?? item.unit)}` : ''}
          </span>
          {prev && (
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {prev.sets.filter((s) => s.done && s.type !== 'A').length} séries
              {prevBest?.reps ? ` × ${prevBest.reps}` : ''}
              {prevBest?.load !== null && prevBest?.load !== undefined ? ` com ${loadText(prevBest.load, prev.unit)}` : ''}
            </span>
          )}
          <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 800 }}>
            Ver progresso do exercício
          </span>
        </div>
        <Sparkline values={sparkValues} width={80} height={40} />
        <Icon name="next" size={18} color="#8A8E97" />
      </Link>

      <div className="sets">
        <div className="set-row head">
          <span style={{ textAlign: 'center' }}>Série</span>
          <span>Anterior</span>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="unit-toggle"
              aria-label={`Unidade da carga: ${unitLabel}. Toque para trocar`}
              onClick={() => setSessionItemUnit(item.id, item.exerciseId, NEXT_UNIT[item.unit])}
            >
              {unitLabel}
              <Icon name="down" size={12} stroke={2.5} />
            </button>
          </span>
          <span style={{ textAlign: 'center' }}>Reps</span>
          <span style={{ textAlign: 'center' }}>Feito</span>
        </div>
        {item.sets.map((s, i) => (
          <SetRow
            key={i}
            index={i}
            label={labels[i]}
            set={s}
            unit={item.unit}
            onOpenMenu={() => setMenuIdx(i)}
            onCommit={(changes) => updateSet(item.id, i, changes)}
            onToggle={(load, reps) => onToggle(i, s, load, reps)}
          />
        ))}
        <button type="button" className="text-btn" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => addSet(item.id)}>
          <Icon name="plus" size={18} /> Adicionar série
        </button>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <button type="button" className="btn big soft" aria-label={`Iniciar descanso de ${restSeconds} segundos`} onClick={() => rest.start(restSeconds)}>
            <Icon name="timer" /> {restSeconds} s
          </button>
          <button type="button" className="btn big primary grow" onClick={conclude}>
            <Icon name="check" stroke={2.5} /> Concluir exercício
          </button>
        </div>
      </div>

      <Sheet
        open={menuIdx !== null}
        onClose={() => setMenuIdx(null)}
        title="Tipo da série"
        subtitle={
          menuSet
            ? `Série ${labels[menuIdx!]}${menuSet.prevLoad !== null && menuSet.prevLoad !== undefined ? ` · ${num(menuSet.prevLoad)} × ${menuSet.prevReps ?? '—'} da última vez` : ''}`
            : undefined
        }
      >
        <div className="list-group">
          {SET_TYPES.map((t) => (
            <button
              type="button"
              key={t.id}
              className="list-item"
              style={{ minHeight: 64 }}
              aria-pressed={menuSet?.type === t.id}
              onClick={async () => {
                if (menuIdx !== null) await updateSet(item.id, menuIdx, { type: t.id as SetType });
                setMenuIdx(null);
              }}
            >
              <span className={t.className} style={{ width: 28, textAlign: 'center', fontSize: 20, fontWeight: 800 }}>
                {t.letter}
              </span>
              <span className="col grow">
                <span style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</span>
                <span className="tiny muted" style={{ fontWeight: 500 }}>
                  {t.desc}
                </span>
              </span>
              {menuSet?.type === t.id && (
                <span className="check-dot">
                  <Icon name="check" size={14} stroke={3} />
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            className="list-item danger"
            onClick={async () => {
              if (menuIdx !== null) await removeSet(item.id, menuIdx);
              setMenuIdx(null);
            }}
          >
            <span style={{ width: 28, display: 'flex', justifyContent: 'center' }}>
              <Icon name="x" stroke={2.5} />
            </span>
            <span className="grow">Remover série</span>
          </button>
        </div>
      </Sheet>
    </main>
  );
}

function SetRow({
  index,
  label,
  set,
  unit,
  onOpenMenu,
  onCommit,
  onToggle,
}: {
  index: number;
  label: string;
  set: DoneSet;
  unit: LoadUnit;
  onOpenMenu: () => void;
  onCommit: (changes: Partial<DoneSet>) => void;
  onToggle: (load: number | null, reps: number | null) => void;
}) {
  const [load, setLoad] = useState(set.load === null ? '' : num(set.load, 2));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  useEffect(() => setLoad(set.load === null ? '' : num(set.load, 2)), [set.load]);
  useEffect(() => setReps(set.reps === null ? '' : String(set.reps)), [set.reps]);

  const info = SET_TYPE_BY_ID[set.type];
  const prevText =
    set.prevLoad !== null && set.prevLoad !== undefined
      ? `${unit === 'placa' ? 'placa ' : ''}${num(set.prevLoad)} × ${set.prevReps ?? '—'}`
      : set.prevReps
        ? `${set.prevReps} reps`
        : '—';
  const repsPlaceholder = set.target || (set.prevReps ? String(set.prevReps) : '');

  return (
    <div className={`set-row ${set.done ? 'done' : ''}`}>
      <button
        type="button"
        className={`set-type ${info.className}`}
        aria-label={`Série ${label}, ${info.name}. Trocar tipo da série`}
        onClick={onOpenMenu}
      >
        {label}
      </button>
      <span className="small muted ellipsis">{prevText}</span>
      <input
        className="set-input"
        inputMode="decimal"
        value={load}
        placeholder="—"
        aria-label={`Carga da série ${index + 1}`}
        onChange={(e) => setLoad(e.target.value)}
        onBlur={() => {
          const v = parseNum(load);
          if (v !== set.load) onCommit({ load: v });
        }}
      />
      <input
        className="set-input"
        inputMode="numeric"
        value={reps}
        placeholder={repsPlaceholder}
        aria-label={`Repetições da série ${index + 1}`}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => {
          const v = parseNum(reps);
          const r = v === null ? null : Math.round(v);
          if (r !== set.reps) onCommit({ reps: r });
        }}
      />
      <button
        type="button"
        className={`set-check ${set.done ? 'on' : ''}`}
        aria-pressed={set.done}
        aria-label={set.done ? `Desmarcar série ${label}` : `Marcar série ${label} como feita`}
        onClick={() => {
          const l = parseNum(load);
          const r = parseNum(reps);
          onToggle(l, r === null ? null : Math.round(r));
        }}
      >
        {set.done && <Icon name="check" size={20} stroke={2.5} />}
      </button>
    </div>
  );
}
