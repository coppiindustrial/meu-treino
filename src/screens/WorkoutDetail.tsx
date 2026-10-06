import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ActionMenu } from '../components/ActionMenu';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, LoadingScreen, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { MuscleBadge } from '../components/MuscleBadge';
import { IntervalConfigButtons } from '../components/Intervals';
import { LogTypePicker } from '../components/LogTypePicker';
import { PlannedSetRow, RepModeSheet, RestSheet, SetTypeSheet } from '../components/SetRow';
import { SwipeRow } from '../components/SwipeRow';
import { LongPressSort } from '../components/LongPressSort';
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
  lastDoneItemFor,
  itemsOf,
  editPlannedSets,
  setItemDistUnit,
  setItemLogType,
  propagatePlanned,
  removeWorkoutItem,
  reorderWorkoutItems,
  startSession,
  toggleSuperset,
  updateWorkout,
  updateWorkoutItem,
} from '../lib/repo';
import type { DoneSet, PlannedSet, RepMode, Workout, WorkoutItem } from '../lib/types';
import { useSlideNavigate } from '../lib/nav';
import { num } from '../lib/format';
import { groupSupersets, itemSummary, plannedSetCount, plannedSummary, plannedVolumeKg, restText } from '../lib/workout';

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

/** Tira um exercício da rotina e mostra "Desfazer" por alguns segundos. */
function useRemoveItem() {
  const { toast } = useDialogs();
  return async (item: WorkoutItem) => {
    const snap = await snapshotWorkout(item.workoutId);
    await removeWorkoutItem(item.id);
    toast('Exercício removido', {
      action: {
        label: 'Desfazer',
        onClick: () => {
          if (snap) void restoreWorkout(snap);
        },
      },
    });
  };
}

export function WorkoutDetail() {
  const { workoutId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const editing = params.get('editar') === '1';
  const go = useSlideNavigate();
  const { confirm, toast } = useDialogs();
  const removeItem = useRemoveItem();
  const [menuOpen, setMenuOpen] = useState(false);
  const [itemMenu, setItemMenu] = useState<string | null>(null);
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

  // Ao entrar na edição, guarda como a rotina estava. Fora da edição, descarta alguma foto velha
  // (ex.: app fechado no meio de uma edição), para o "Cancelar" não voltar a um estado antigo.
  useEffect(() => {
    if (!workoutId) return;
    if (!editing) return writeSnap(workoutId, null);
    if (readSnap(workoutId)) return;
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

  if (!data) return <LoadingScreen back="/treinos" />;
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
        message: 'O treino volta a ficar como estava antes de você começar a editar.',
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
      title: 'Duplicar treino?',
      message: `Uma cópia de "${workout.name}" será criada nesta rotina.`,
      confirmLabel: 'Duplicar',
    });
    if (!ok) return;
    const id = await duplicateWorkout(workout.id);
    toast('Treino duplicado');
    go(`/treino/${id}`);
  };

  const start = async () => {
    const active = await getActiveSession();
    if (active && active.workoutId !== workout.id) {
      const ok = await confirm({
        title: 'Você já tem um treino em andamento',
        message: `"${active.title}" ainda não foi finalizado. Quer continuar nele?`,
        confirmLabel: 'Continuar esse treino',
      });
      if (ok) go('/sessao');
      return;
    }
    await startSession(workout.id);
    go('/sessao');
  };

  const removeWorkout = async () => {
    const ok = await confirm({
      title: `Excluir o treino ${workout.letter}?`,
      message: 'Os exercícios montados nele serão apagados. O histórico do que você já fez continua guardado.',
      confirmLabel: 'Excluir treino',
      danger: true,
    });
    if (!ok) return;
    await deleteWorkout(workout.id);
    go(program ? `/ficha/${program.id}` : '/treinos', { dir: 'back', replace: true });
  };

  const menuItem = itemMenu ? items.find((x) => x.id === itemMenu) : undefined;
  const groups = groupSupersets(items);
  const inSuperset = new Set(groups.filter((g) => g.length > 1).flat().map((it) => it.id));
  const exOf = (i: number) => exerciseOrMissing(map, items[i].exerciseId);
  const setCount = plannedSetCount(items, (i) => exOf(i).logType);
  const volume = plannedVolumeKg(items, exOf);

  return (
    <main className={`screen no-tabs ${!editing && items.length > 0 ? 'with-dock' : ''}`}>
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
        title={editing ? 'Editar treino' : 'Treino'}
        right={
          editing ? (
            <button type="button" className="pill-primary" onClick={finishEditing}>
              Atualizar
            </button>
          ) : (
            <div className="head-actions">
              <Link to={`/treino/${workout.id}/adicionar`} className="glass circle" aria-label="Adicionar exercício">
                <Icon name="plus" size={22} stroke={2.4} />
              </Link>
              <button type="button" className="glass circle" aria-label="Opções do treino" onClick={() => setMenuOpen(true)}>
                <Icon name="more" size={22} />
              </button>
            </div>
          )
        }
      />

      {!editing ? (
        <div className="stack">
          <div className="col">
            <h1 className="h1">{workout.name}</h1>
            <span className="small muted">
              Treino {workout.letter}
              {program ? ` · ${program.name}` : ''}
            </span>
          </div>
          {items.length > 0 && (
            <div className="routine-stats">
              <div>
                <b className="tnum">{items.length}</b>
                <span>{items.length === 1 ? 'exercício' : 'exercícios'}</span>
              </div>
              <div>
                <b className="tnum">{setCount}</b>
                <span>{setCount === 1 ? 'série' : 'séries'}</span>
              </div>
              <div>
                <b className="tnum">{volume ? `${num(volume, 0)} kg` : '—'}</b>
                <span>volume previsto</span>
              </div>
            </div>
          )}
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

      {items.length === 0 && (
        <EmptyState
          title="Nenhum exercício ainda"
          text="Adicione os exercícios deste treino."
          action={editing ? undefined : { label: 'Adicionar exercício', to: `/treino/${workout.id}/adicionar` }}
        />
      )}

      {!editing ? (
        <div className="routine-rows">
          {/* Segurar e arrastar muda a ordem; deslizar para o lado remove. Superset: faixa roxa na linha. */}
          <LongPressSort className="tight" ids={items.map((it) => it.id)} onReorder={(ids) => void reorderWorkoutItems(workout.id, ids)}>
            {(id) => {
              const it = items.find((x) => x.id === id)!;
              const ex = exerciseOrMissing(map, it.exerciseId);
              const ss = inSuperset.has(it.id);
              return (
                <SwipeRow label="Remover" onDelete={() => removeItem(it)}>
                  <div className={`ex-row ${ss ? 'ss' : ''}`}>
                    {/* Foto e nome abrem o exercício; o ⋮ abre o mesmo menu do Editar. */}
                    <Link to={`/exercicio/${it.exerciseId}`} className="ex-row-link" draggable={false}>
                      <span className="ex-photo">
                        <ExerciseThumb exercise={ex} />
                        <MuscleBadge primary={ex.primary} secondary={ex.secondary} />
                      </span>
                      <span className="col grow" style={{ minWidth: 0 }}>
                        <span className="ex-row-name">
                          {ex.name}
                          {ss && <span className="ss-tag">Superset</span>}
                        </span>
                        <span className="small muted">
                          {itemSummary(it, ex.logType, ex.unit)}
                          {(it.logType ?? ex.logType) !== 'tiros' ? ` · descanso ${restText(it.restSeconds ?? workout.restSeconds)}` : ''}
                        </span>
                        {it.note ? <span className="chip method">{it.note}</span> : null}
                      </span>
                    </Link>
                    <button type="button" className="ex-row-more" aria-label={`Opções de ${ex.name}`} onClick={() => setItemMenu(it.id)}>
                      <Icon name="moreV" size={22} />
                    </button>
                  </div>
                </SwipeRow>
              );
            }}
          </LongPressSort>
          {items.length > 0 && (
            <div className="dock">
              <button type="button" className="btn primary block" onClick={start}>
                <Icon name="play" /> Iniciar treino
              </button>
            </div>
          )}
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
          <Link to={`/treino/${workout.id}/adicionar`} className="btn small primary block">
            <Icon name="plus" /> Adicionar exercício
          </Link>
        </div>
      )}
      <div ref={bottomRef} />

      {menuItem && (
        <ItemMenuSheet
          open
          onClose={() => setItemMenu(null)}
          item={menuItem}
          ex={exerciseOrMissing(map, menuItem.exerciseId)}
          workout={workout}
          index={items.indexOf(menuItem)}
          total={items.length}
        />
      )}

      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { icon: 'sort', label: 'Reordenar exercícios', hidden: items.length < 2, onClick: () => go(`/treino/${workout.id}/reordenar`) },
          { icon: 'pencil', label: 'Editar treino', onClick: () => setEditing(true) },
          { icon: 'copy', label: 'Duplicar treino', onClick: duplicate },
          { icon: 'x', label: 'Excluir treino', danger: true, onClick: removeWorkout },
        ]}
      />

    </main>
  );
}

function EditorCard({ item, index, total, workout, ex }: { item: WorkoutItem; index: number; total: number; workout: Workout; ex: ExerciseView }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [typeIdx, setTypeIdx] = useState<number | null>(null);

  const mode = repModeOf(item);
  const labels = setLabels(item.sets.map((s) => s.type));
  const unitLabel = ex.unit === 'placa' ? 'Placa' : ex.unit;
  const save = (change: (sets: PlannedSet[]) => PlannedSet[]) => editPlannedSets(item.id, change);
  const logType = item.logType ?? ex.logType;
  const distUnit = item.distUnit ?? ex.distUnit;
  const cardio = isCardio(logType);

  // "Anterior": o que foi feito da última vez em cada série (mesma regra do treino).
  const lastItem = useLiveQuery(() => lastDoneItemFor(item.exerciseId), [item.exerciseId]);
  const lastDone = lastItem ? lastItem.sets.filter((x) => x.done) : [];
  const prevOf = (i: number): DoneSet | undefined => (lastItem?.sets[i]?.done ? lastItem.sets[i] : lastDone[i]);

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
              <span style={{ textAlign: 'center' }}>Anterior</span>
              {logType === 'tempo_km' && <span style={{ textAlign: 'center' }}>Meta {distUnit}</span>}
              <span style={{ textAlign: 'center' }}>Meta tempo</span>
            </div>
          ) : (
            <div className="set-row head plan">
              <span style={{ textAlign: 'center' }}>Série</span>
              <span style={{ textAlign: 'center' }}>Anterior</span>
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
                prev={prevOf(i)}
                unit={ex.unit}
                name={ex.name}
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
      <ItemMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        item={item}
        ex={ex}
        workout={workout}
        index={index}
        total={total}
        showView
      />
    </section>
  );
}

/**
 * Menu de um exercício do treino: tipo de registro, reordenar, substituir, superset e remover.
 * O mesmo no Editar e no ⋮ da lista (lá sem "Ver exercício", porque tocar na linha já abre o exercício).
 */
function ItemMenuSheet({
  open,
  onClose,
  item,
  ex,
  workout,
  index,
  total,
  showView = false,
}: {
  open: boolean;
  onClose: () => void;
  item: WorkoutItem;
  ex: ExerciseView;
  workout: Workout;
  index: number;
  total: number;
  showView?: boolean;
}) {
  const removeItem = useRemoveItem();
  const logType = item.logType ?? ex.logType;
  const distUnit = item.distUnit ?? ex.distUnit;
  return (
    <Sheet open={open} onClose={onClose} title={ex.name}>
      <LogTypePicker
        value={logType}
        distUnit={distUnit}
        onType={async (t) => {
          await setItemLogType('workoutItems', item.id, item.exerciseId, t);
          // Cardio sem séries ganha uma linha para as metas (os tiros usam só a configuração).
          if (t !== 'tiros' && t !== 'carga' && item.sets.length === 0) {
            await editPlannedSets(item.id, () => [{ type: 'N', reps: '', load: null, secs: t === 'tempo' ? 60 : null, dist: null }]);
          }
        }}
        onDistUnit={(u) => setItemDistUnit('workoutItems', item.id, item.exerciseId, u)}
      />
      <div className="list-group">
        {total > 1 && (
          <Link to={`/treino/${workout.id}/reordenar`} className="list-item">
            <Icon name="sort" color="var(--text-2)" />
            <span className="grow">Reordenar exercícios</span>
          </Link>
        )}
        <Link to={`/treino/${workout.id}/substituir/${item.id}`} className="list-item">
          <Icon name="swap" color="var(--text-2)" />
          <span className="grow">Substituir exercício</span>
        </Link>
        {index < total - 1 && (
          <button
            type="button"
            className="list-item"
            onClick={async () => {
              await toggleSuperset(item.id);
              onClose();
            }}
          >
            <Icon name="link" color="var(--text-2)" />
            <span className="grow col">
              <span>{item.supersetNext ? 'Tirar do superset' : 'Adicionar ao superset'}</span>
              {!item.supersetNext && <span className="tiny muted">Junta com o próximo exercício</span>}
            </span>
          </button>
        )}
        {showView && (
          <Link to={`/exercicio/${item.exerciseId}`} className="list-item">
            <Icon name="chart" color="var(--text-2)" />
            <span className="grow">Ver exercício e progresso</span>
          </Link>
        )}
        <button
          type="button"
          className="list-item danger"
          onClick={() => {
            onClose();
            void removeItem(item);
          }}
        >
          <Icon name="trash" />
          <span className="grow">Remover exercício</span>
        </button>
      </div>
    </Sheet>
  );
}
