import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ActionMenu } from '../components/ActionMenu';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { IntervalConfigButtons } from '../components/Intervals';
import { LogTypePicker } from '../components/LogTypePicker';
import { PlannedSetRow, RepModeSheet, RestSheet, SetTypeSheet } from '../components/SetRow';
import { SwipeRow } from '../components/SwipeRow';
import { isCardio, logTypeName } from '../lib/cardio';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { setLabels } from '../lib/equipment';
import { exerciseOrMissing, useExercises, type ExerciseView } from '../lib/exercises';
import {
  deleteWorkout,
  duplicateWorkout,
  restoreWorkout,
  sameWorkout,
  snapshotWorkout,
  type WorkoutSnapshot,
  getActiveSession,
  itemsOf,
  moveWorkoutItem,
  editPlannedSets,
  setItemDistUnit,
  setItemLogType,
  propagatePlanned,
  removeWorkoutItem,
  startSession,
  toggleSuperset,
  updateWorkout,
  updateWorkoutItem,
} from '../lib/repo';
import type { PlannedSet, RepMode, Workout, WorkoutItem } from '../lib/types';
import { groupSupersets, itemSummary, plannedSummary, restText } from '../lib/workout';

export { groupSupersets, plannedSummary };

// Como a rotina estava ao começar a editar (para o "Cancelar" desfazer). Sobrevive à ida ao seletor de exercícios.
const snapKey = (id: string) => `mt.edit.${id}`;
function readSnap(id: string): WorkoutSnapshot | null {
  try {
    const raw = sessionStorage.getItem(snapKey(id));
    return raw ? (JSON.parse(raw) as WorkoutSnapshot) : null;
  } catch {
    return null;
  }
}
function writeSnap(id: string, snap: WorkoutSnapshot | null): void {
  try {
    if (snap) sessionStorage.setItem(snapKey(id), JSON.stringify(snap));
    else sessionStorage.removeItem(snapKey(id));
  } catch {
    // sem armazenamento: o Cancelar só sai da edição
  }
}

function repModeOf(item: WorkoutItem): RepMode {
  return item.repMode ?? (item.sets.some((s) => s.reps.includes('-')) ? 'faixa' : 'fixa');
}

/** Converte as repetições das séries ao trocar entre fixas e faixa. */
function convertReps(sets: PlannedSet[], mode: RepMode): PlannedSet[] {
  return sets.map((s) => {
    const [a, b] = s.reps.split('-').map((x) => x.trim());
    if (mode === 'fixa') return { ...s, reps: a || '10' };
    if (b) return s;
    const n = Number(a);
    return { ...s, reps: Number.isFinite(n) && n > 0 ? `${Math.max(1, n - 2)}-${n + 2}` : '8-12' };
  });
}

export function WorkoutDetail() {
  const { workoutId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const editing = params.get('editar') === '1';
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const [menuOpen, setMenuOpen] = useState(false);
  const { map } = useExercises();
  const bottomRef = useRef<HTMLDivElement>(null);

  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(workoutId);
    const program = workout ? await db.programs.get(workout.programId) : undefined;
    const items = await itemsOf(workoutId);
    return { workout, program, items };
  }, [workoutId]);

  const [name, setName] = useState('');
  const [letter, setLetter] = useState('');
  useEffect(() => {
    if (data?.workout) {
      setName(data.workout.name);
      setLetter(data.workout.letter);
    }
  }, [data?.workout?.id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao entrar na edição, guarda como a rotina estava.
  useEffect(() => {
    if (!editing || !workoutId || readSnap(workoutId)) return;
    void snapshotWorkout(workoutId).then((snap) => snap && writeSnap(workoutId, snap));
  }, [editing, workoutId]);

  // Depois de adicionar exercícios, rola até o fim para mostrar os novos.
  const justAdded = params.get('novo') === '1';
  useEffect(() => {
    if (!justAdded || !data) return;
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 250);
    const next = new URLSearchParams(params);
    next.delete('novo');
    setParams(next, { replace: true });
  }, [justAdded, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <main className="screen no-tabs" />;
  const { workout, program, items } = data;
  if (!workout || workout.deleted) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton to="/treinos" label="Treinos" />} />
        <EmptyState title="Treino não encontrado" action={{ label: 'Ver treinos', to: '/treinos' }} />
      </main>
    );
  }

  const setEditing = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set('editar', '1');
    else next.delete('editar');
    setParams(next, { replace: true });
  };

  const saveMeta = async () => {
    await updateWorkout(workout.id, {
      name: name.trim() || workout.name,
      letter: (letter.trim() || workout.letter).slice(0, 2).toUpperCase(),
    });
  };

  const finishEditing = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await saveMeta();
    writeSnap(workout.id, null);
    setEditing(false);
  };

  const cancelEditing = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const before = readSnap(workout.id);
    const now = await snapshotWorkout(workout.id);
    if (before && now && !sameWorkout(before, now)) {
      const ok = await confirm({
        title: 'Descartar as alterações?',
        message: 'A rotina volta a ficar como estava antes de você começar a editar.',
        confirmLabel: 'Descartar',
        danger: true,
      });
      if (!ok) return;
      await restoreWorkout(before);
    }
    writeSnap(workout.id, null);
    setEditing(false);
  };

  const duplicate = async () => {
    const ok = await confirm({
      title: 'Duplicar rotina?',
      message: `Uma cópia de "${workout.name}" será criada nesta ficha.`,
      confirmLabel: 'Duplicar',
    });
    if (!ok) return;
    const id = await duplicateWorkout(workout.id);
    toast('Rotina duplicada');
    navigate(`/treino/${id}`);
  };

  const start = async () => {
    const active = await getActiveSession();
    if (active && active.workoutId !== workout.id) {
      const ok = await confirm({
        title: 'Você já tem um treino em andamento',
        message: `"${active.title}" ainda não foi finalizado. Quer continuar nele?`,
        confirmLabel: 'Continuar esse treino',
      });
      if (ok) navigate('/sessao');
      return;
    }
    await startSession(workout.id);
    navigate('/sessao');
  };

  const removeWorkout = async () => {
    const ok = await confirm({
      title: `Excluir a rotina ${workout.letter}?`,
      message: 'Os exercícios montados nele serão apagados. O histórico do que você já fez continua guardado.',
      confirmLabel: 'Excluir rotina',
      danger: true,
    });
    if (!ok) return;
    await deleteWorkout(workout.id);
    navigate(program ? `/ficha/${program.id}` : '/treinos', { replace: true });
  };

  const groups = groupSupersets(items);

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          editing ? (
            <button type="button" className="glass pill accent-text" onClick={cancelEditing}>
              Cancelar
            </button>
          ) : (
            <BackButton to={program ? `/ficha/${program.id}` : '/treinos'} />
          )
        }
        title={editing ? 'Editar rotina' : 'Rotina'}
        right={
          editing ? (
            <button type="button" className="pill-primary" onClick={finishEditing}>
              Atualizar
            </button>
          ) : (
            <button type="button" className="glass circle" aria-label="Opções da rotina" onClick={() => setMenuOpen(true)}>
              <Icon name="more" size={22} />
            </button>
          )
        }
      />

      {!editing ? (
        <div className="stack">
          <div className="col">
            <h1 className="h1">{workout.name}</h1>
            <span className="small muted">
              Treino {workout.letter} · {items.length} {items.length === 1 ? 'exercício' : 'exercícios'}
              {program ? ` · ${program.name}` : ''}
            </span>
          </div>
          <button type="button" className="btn primary block" onClick={start} disabled={items.length === 0}>
            <Icon name="play" /> Iniciar rotina
          </button>
          {items.length > 0 && <span className="label" style={{ marginTop: 8 }}>Exercícios</span>}
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 72 }}>
            <span className="label">Letra</span>
            <input className="input" value={letter} maxLength={2} onChange={(e) => setLetter(e.target.value)} onBlur={saveMeta} style={{ textAlign: 'center' }} />
          </label>
          <label className="field grow">
            <span className="label">Nome do treino</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta} />
          </label>
        </div>
      )}

      {items.length === 0 && <EmptyState title="Nenhum exercício ainda" text="Adicione os exercícios deste treino." />}

      {!editing ? (
        <div className="routine-rows">
          {groups.map((g) => {
            const rows = g.map((it) => {
              const ex = exerciseOrMissing(map, it.exerciseId);
              return (
                <Link key={it.id} to={`/exercicio/${it.exerciseId}`} className="routine-row">
                  <span className="ex-avatar">
                    <ExerciseThumb exercise={ex} />
                  </span>
                  <div className="col grow">
                    <span style={{ fontWeight: 600 }}>{ex.name}</span>
                    <span className="small muted">
                      {itemSummary(it, ex.logType, ex.unit)}
                      {(it.logType ?? ex.logType) !== 'tiros' ? ` · descanso ${restText(it.restSeconds ?? workout.restSeconds)}` : ''}
                    </span>
                    {it.note ? <span className="chip method">{it.note}</span> : null}
                  </div>
                  <Icon name="next" size={20} color="var(--muted)" />
                </Link>
              );
            });
            if (g.length === 1) return rows;
            return (
              <div key={g[0].id} className="ss-group">
                <span className="ss-label">Superset</span>
                {rows}
              </div>
            );
          })}
          <Link to={`/treino/${workout.id}/adicionar`} className="btn soft block" style={{ marginTop: 12 }}>
            <Icon name="plus" /> Adicionar exercício
          </Link>
        </div>
      ) : (
        <div className="stack-lg">
          {groups.map((g) => {
            const cards = g.map((it) => (
              <EditorCard
                key={it.id}
                item={it}
                index={items.indexOf(it)}
                total={items.length}
                workout={workout}
                ex={exerciseOrMissing(map, it.exerciseId)}
              />
            ));
            if (g.length === 1) return cards;
            return (
              <div key={g[0].id} className="ss-group">
                <span className="ss-label">Superset</span>
                {cards}
              </div>
            );
          })}
          <Link to={`/treino/${workout.id}/adicionar`} className="btn big dashed block">
            <Icon name="plus" /> Adicionar exercício
          </Link>
        </div>
      )}
      <div ref={bottomRef} />

      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { icon: 'copy', label: 'Duplicar rotina', onClick: duplicate },
          { icon: 'pencil', label: 'Editar rotina', onClick: () => setEditing(true) },
          { icon: 'x', label: 'Excluir rotina', danger: true, onClick: removeWorkout },
        ]}
      />

    </main>
  );
}

function EditorCard({ item, index, total, workout, ex }: { item: WorkoutItem; index: number; total: number; workout: Workout; ex: ExerciseView }) {
  const { confirm } = useDialogs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [typeIdx, setTypeIdx] = useState<number | null>(null);
  const [note, setNote] = useState(item.note ?? '');
  useEffect(() => setNote(item.note ?? ''), [item.note]);

  const mode = repModeOf(item);
  const labels = setLabels(item.sets.map((s) => s.type));
  const unitLabel = ex.unit === 'placa' ? 'Placa' : ex.unit;
  const save = (change: (sets: PlannedSet[]) => PlannedSet[]) => editPlannedSets(item.id, change);
  const logType = item.logType ?? ex.logType;
  const distUnit = item.distUnit ?? ex.distUnit;
  const cardio = isCardio(logType);

  return (
    <section className="ex-card">
      <div className="ex-head">
        <span className="ex-title">
          <span className="ex-avatar">
            <ExerciseThumb exercise={ex} />
          </span>
          <span className="ex-name">{ex.name}</span>
        </span>
        <button type="button" className="icon-btn ghost" aria-label={`Opções de ${ex.name}`} onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </div>
      <input
        className="ex-note"
        value={note}
        placeholder="Método ou observação (ex.: drop-set na última)"
        aria-label="Método ou observação"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note !== (item.note ?? '')) void updateWorkoutItem(item.id, { note: note.trim() });
        }}
      />
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {cardio && <span className="log-tag">{logTypeName(logType)}</span>}
        {logType !== 'tiros' && (
          <button type="button" className="rest-link" onClick={() => setRestOpen(true)}>
            <Icon name="timer" size={16} /> Descanso: {restText(item.restSeconds ?? workout.restSeconds)}
          </button>
        )}
      </div>
      {logType === 'tiros' ? (
        <IntervalConfigButtons value={item.interval} onChange={(interval) => updateWorkoutItem(item.id, { interval })} />
      ) : (
        <div className="sets">
          {cardio ? (
            <div className={`set-row head plan ${logType === 'tempo' ? 'c-t' : 'c-tk'}`}>
              <span style={{ textAlign: 'center' }}>Série</span>
              {logType === 'tempo_km' && <span style={{ textAlign: 'center' }}>Meta {distUnit}</span>}
              <span style={{ textAlign: 'center' }}>Meta tempo</span>
            </div>
          ) : (
            <div className="set-row head plan">
              <span style={{ textAlign: 'center' }}>Série</span>
              <span style={{ textAlign: 'center' }}>{unitLabel}</span>
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <button type="button" className="unit-toggle" onClick={() => setModeOpen(true)} aria-label="Escolher repetições fixas ou faixa">
                  {mode === 'faixa' ? 'Faixa de reps' : 'Reps'}
                  <Icon name="down" size={12} stroke={2.5} />
                </button>
              </span>
            </div>
          )}
          {item.sets.map((s, i) => (
            <SwipeRow key={i} onDelete={() => save((sets) => sets.filter((_, j) => j !== i))}>
              <PlannedSetRow
                label={labels[i]}
                set={s}
                hint={i > 0 ? item.sets[i - 1] : undefined}
                repMode={mode}
                logType={logType}
                distUnit={distUnit}
                onOpenMenu={() => setTypeIdx(i)}
                onChange={(changes) => save((sets) => propagatePlanned(sets, i, changes))}
              />
            </SwipeRow>
          ))}
          <button
            type="button"
            className="btn soft small block"
            onClick={() => {
              void save((sets) => {
                const last = sets[sets.length - 1];
                const next: PlannedSet = last
                  ? { ...last, type: last.type === 'A' ? 'N' : last.type }
                  : cardio
                    ? { type: 'N', reps: '', load: null, secs: logType === 'tempo' ? 60 : null, dist: null }
                    : { type: 'N', reps: mode === 'faixa' ? '8-12' : '10', load: null };
                return [...sets, next];
              });
            }}
          >
            <Icon name="plus" /> Adicionar série
          </button>
        </div>
      )}

      <SetTypeSheet
        open={typeIdx !== null}
        onClose={() => setTypeIdx(null)}
        current={typeIdx !== null ? item.sets[typeIdx]?.type : undefined}
        subtitle={ex.name}
        onPick={async (t) => {
          if (typeIdx !== null) await save((sets) => sets.map((s, i) => (i === typeIdx ? { ...s, type: t } : s)));
          setTypeIdx(null);
        }}
        onRemove={async () => {
          if (typeIdx !== null) await save((sets) => sets.filter((_, i) => i !== typeIdx));
          setTypeIdx(null);
        }}
      />
      <RestSheet
        open={restOpen}
        onClose={() => setRestOpen(false)}
        value={item.restSeconds ?? workout.restSeconds}
        onPick={async (s) => {
          await updateWorkoutItem(item.id, { restSeconds: s });
          setRestOpen(false);
        }}
      />
      <RepModeSheet
        open={modeOpen}
        onClose={() => setModeOpen(false)}
        value={mode}
        onPick={async (m) => {
          await updateWorkoutItem(item.id, { repMode: m, sets: convertReps(item.sets, m) });
          setModeOpen(false);
        }}
      />
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={ex.name}>
        <LogTypePicker
          value={logType}
          distUnit={distUnit}
          onType={async (t) => {
            await setItemLogType('workoutItems', item.id, item.exerciseId, t);
            // Cardio sem séries ganha uma linha para as metas (os tiros usam só a configuração).
            if (t !== 'tiros' && t !== 'carga' && item.sets.length === 0) {
              await save(() => [{ type: 'N', reps: '', load: null, secs: t === 'tempo' ? 60 : null, dist: null }]);
            }
          }}
          onDistUnit={(u) => setItemDistUnit('workoutItems', item.id, item.exerciseId, u)}
        />
        <div className="list-group">
          <Link to={`/exercicio/${item.exerciseId}`} className="list-item">
            <Icon name="chart" color="var(--text-2)" />
            <span className="grow">Ver exercício e progresso</span>
          </Link>
          {index > 0 && (
            <button type="button" className="list-item" onClick={() => moveWorkoutItem(item.workoutId, index, index - 1)}>
              <Icon name="up" color="var(--text-2)" />
              <span className="grow">Mover para cima</span>
            </button>
          )}
          {index < total - 1 && (
            <button type="button" className="list-item" onClick={() => moveWorkoutItem(item.workoutId, index, index + 1)}>
              <Icon name="down" color="var(--text-2)" />
              <span className="grow">Mover para baixo</span>
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              className="list-item"
              onClick={async () => {
                await toggleSuperset(item.id);
                setMenuOpen(false);
              }}
            >
              <Icon name="link" color="var(--text-2)" />
              <span className="grow">{item.supersetNext ? 'Separar do superset' : 'Fazer superset com o próximo'}</span>
            </button>
          )}
          <button
            type="button"
            className="list-item danger"
            onClick={async () => {
              const ok = await confirm({ title: `Remover ${ex.name} da rotina?`, confirmLabel: 'Remover', danger: true });
              if (!ok) return;
              setMenuOpen(false);
              await removeWorkoutItem(item.id);
            }}
          >
            <Icon name="trash" />
            <span className="grow">Remover da rotina</span>
          </button>
        </div>
      </Sheet>
    </section>
  );
}
