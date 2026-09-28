import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { Sheet } from '../components/Sheet';
import { db } from '../lib/db';
import { SET_TYPES, loadText } from '../lib/equipment';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { parseNum } from '../lib/format';
import {
  deleteWorkout,
  getActiveSession,
  itemsOf,
  moveWorkoutItem,
  removeWorkoutItem,
  startSession,
  toggleSuperset,
  updateWorkout,
  updateWorkoutItem,
} from '../lib/repo';
import type { LoadUnit, PlannedSet, SetType, WorkoutItem } from '../lib/types';

export function plannedSummary(sets: PlannedSet[], unit: LoadUnit): string {
  const work = sets.filter((s) => s.type !== 'A');
  const warm = sets.length - work.length;
  if (sets.length === 0) return 'Sem séries';
  const reps = [...new Set(work.map((s) => s.reps).filter(Boolean))];
  const loads = work.map((s) => s.load).filter((l): l is number => l !== null);
  let text = `${work.length} × ${reps.length === 0 ? '—' : reps.join('/')}`;
  if (loads.length) text += ` · ${loadText(Math.max(...loads), unit)}`;
  if (warm) text += ` · ${warm} aquec.`;
  return text;
}

/** Agrupa itens consecutivos ligados em superset. */
export function groupSupersets<T extends { supersetNext: boolean }>(items: T[]): T[][] {
  const groups: T[][] = [];
  items.forEach((it, i) => {
    if (i === 0 || !items[i - 1].supersetNext) groups.push([]);
    groups[groups.length - 1].push(it);
  });
  return groups;
}

export function WorkoutDetail() {
  const { workoutId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const editing = params.get('editar') === '1';
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const { map } = useExercises();
  const [planFor, setPlanFor] = useState<WorkoutItem | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(workoutId);
    const program = workout ? await db.programs.get(workout.programId) : undefined;
    const items = await itemsOf(workoutId);
    return { workout, program, items };
  }, [workoutId]);

  const [name, setName] = useState('');
  const [letter, setLetter] = useState('');
  const [rest, setRest] = useState('');
  useEffect(() => {
    if (data?.workout) {
      setName(data.workout.name);
      setLetter(data.workout.letter);
      setRest(String(data.workout.restSeconds));
    }
  }, [data?.workout?.id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

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
      restSeconds: Math.max(0, Math.round(parseNum(rest) ?? workout.restSeconds)),
    });
  };

  const finishEditing = async () => {
    await saveMeta();
    setEditing(false);
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
      title: `Excluir o treino ${workout.letter}?`,
      message: 'Os exercícios montados nele serão apagados. O histórico do que você já fez continua guardado.',
      confirmLabel: 'Excluir treino',
      danger: true,
    });
    if (!ok) return;
    await deleteWorkout(workout.id);
    navigate(program ? `/ficha/${program.id}` : '/treinos', { replace: true });
  };

  const onHandleDown = (i: number) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: i, over: i });
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row-index]') as HTMLElement | null;
    if (el) {
      const over = Number(el.dataset.rowIndex);
      if (over !== drag.over) setDrag({ ...drag, over });
    }
  };
  const onHandleUp = async () => {
    if (drag && drag.over !== drag.from) await moveWorkoutItem(workout.id, drag.from, drag.over);
    setDrag(null);
  };

  const groups = groupSupersets(items);

  return (
    <main className="screen no-tabs">
      <TopBar
        left={<BackButton to={program ? `/ficha/${program.id}` : '/treinos'} label={program ? 'Ficha' : 'Treinos'} />}
        right={
          editing ? (
            <button type="button" className="text-btn" onClick={finishEditing} style={{ fontWeight: 800 }}>
              Pronto
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={() => setEditing(true)}>
              Editar
            </button>
          )
        }
      />

      {!editing ? (
        <div className="row">
          <div className="letter big on">{workout.letter}</div>
          <div className="col grow">
            <h1 className="display" style={{ fontSize: 32 }}>
              {workout.name}
            </h1>
            <span className="small muted">
              {items.length} {items.length === 1 ? 'exercício' : 'exercícios'} · descanso {workout.restSeconds} s
              {program ? ` · ${program.name}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <div className="stack">
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
          <label className="field">
            <span className="label">Descanso entre séries (segundos)</span>
            <input className="input" inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} onBlur={saveMeta} />
          </label>
          <span className="small muted" style={{ lineHeight: 1.5 }}>
            Toque num exercício para ajustar as séries. Mude a ordem com as setas ou arrastando pela alça. Junte exercícios para fazer em superset.
          </span>
        </div>
      )}

      {items.length === 0 && (
        <EmptyState title="Nenhum exercício ainda" text="Adicione os exercícios deste treino." />
      )}

      {!editing ? (
        <div className="stack">
          {groups.map((g) => {
            const rows = g.map((it) => {
              const ex = exerciseOrMissing(map, it.exerciseId);
              return (
                <Link key={it.id} to={`/exercicio/${it.exerciseId}`} className="list-row" style={{ padding: '10px 12px 10px 10px' }}>
                  <ExerciseThumb exercise={ex} />
                  <div className="col grow">
                    <span style={{ fontWeight: 700 }}>{ex.name}</span>
                    <span className="small muted">{plannedSummary(it.sets, ex.unit)}</span>
                    {it.note ? <span className="chip method">{it.note}</span> : null}
                  </div>
                  <Icon name="next" size={20} color="#8A8E97" />
                </Link>
              );
            });
            if (g.length === 1) return rows;
            return (
              <div key={g[0].id} className="superset">
                <div className="superset-head">
                  <Icon name="link" size={16} />
                  <span className="eyebrow" style={{ fontSize: 12 }}>
                    Superset · {g.length} exercícios
                  </span>
                  <span className="tiny muted">sem descanso entre eles</span>
                </div>
                {rows}
              </div>
            );
          })}
          <Link to={`/treino/${workout.id}/adicionar`} className="btn big dashed block">
            <Icon name="plus" /> Adicionar exercício
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {items.map((it, i) => {
            const ex = exerciseOrMissing(map, it.exerciseId);
            const isLast = i === items.length - 1;
            const dragging = drag?.from === i;
            const target = drag && drag.over === i && drag.from !== i;
            return (
              <div key={it.id} className="stack" style={{ gap: 6 }}>
                <div
                  data-row-index={i}
                  className="list-row"
                  style={{
                    padding: '6px 6px 6px 4px',
                    gap: 8,
                    border: target ? '2px solid var(--accent)' : '1px solid var(--border)',
                    opacity: dragging ? 0.5 : 1,
                  }}
                >
                  <span
                    className="drag-handle"
                    aria-hidden="true"
                    onPointerDown={onHandleDown(i)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <Icon name="grip" size={20} />
                  </span>
                  <button
                    type="button"
                    className="col grow"
                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--text)' }}
                    onClick={() => setPlanFor(it)}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {i + 1}. {ex.name}
                    </span>
                    <span className="tiny muted">{plannedSummary(it.sets, ex.unit)} · toque para ajustar</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 40, minWidth: 40, color: i === 0 ? '#4A4E56' : undefined }}
                    aria-label={`Subir ${ex.name}`}
                    onClick={() => moveWorkoutItem(workout.id, i, i - 1)}
                  >
                    <Icon name="up" size={18} stroke={2.5} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 40, minWidth: 40, color: isLast ? '#4A4E56' : undefined }}
                    aria-label={`Descer ${ex.name}`}
                    onClick={() => moveWorkoutItem(workout.id, i, i + 1)}
                  >
                    <Icon name="down" size={18} stroke={2.5} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn ghost"
                    style={{ width: 36, minWidth: 36, color: 'var(--danger)' }}
                    aria-label={`Remover ${ex.name}`}
                    onClick={() => removeWorkoutItem(it.id)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
                {!isLast && (
                  <button
                    type="button"
                    className={`link-pill ${it.supersetNext ? 'on' : ''}`}
                    onClick={() => toggleSuperset(it.id)}
                    aria-label={it.supersetNext ? 'Separar do superset' : 'Juntar com o próximo em superset'}
                  >
                    <Icon name="link" size={14} stroke={2.5} />
                    {it.supersetNext ? 'Em superset · toque para separar' : 'Juntar em superset'}
                  </button>
                )}
              </div>
            );
          })}
          <Link to={`/treino/${workout.id}/adicionar`} className="btn big dashed block" style={{ marginTop: 8 }}>
            <Icon name="plus" /> Adicionar exercício
          </Link>
          <button type="button" className="btn block danger" style={{ marginTop: 8 }} onClick={removeWorkout}>
            <Icon name="trash" size={18} /> Excluir este treino
          </button>
        </div>
      )}

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {editing ? (
            <button type="button" className="btn big primary grow" onClick={finishEditing}>
              Salvar alterações
            </button>
          ) : (
            <button type="button" className="btn big primary grow" onClick={start} disabled={items.length === 0}>
              <Icon name="play" size={18} /> Iniciar treino
            </button>
          )}
        </div>
      </div>

      {planFor && (
        <PlanSheet
          item={planFor}
          unit={exerciseOrMissing(map, planFor.exerciseId).unit}
          title={exerciseOrMissing(map, planFor.exerciseId).name}
          onClose={() => setPlanFor(null)}
        />
      )}
    </main>
  );
}

function PlanSheet({ item, unit, title, onClose }: { item: WorkoutItem; unit: LoadUnit; title: string; onClose: () => void }) {
  const [sets, setSets] = useState(
    item.sets.map((s) => ({ type: s.type, reps: s.reps, load: s.load === null ? '' : String(s.load).replace('.', ',') })),
  );
  const [note, setNote] = useState(item.note ?? '');

  const update = (i: number, changes: Partial<(typeof sets)[number]>) =>
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...changes } : s)));

  const save = async () => {
    await updateWorkoutItem(item.id, {
      sets: sets.map((s) => ({ type: s.type, reps: s.reps.trim(), load: parseNum(s.load) })),
      note: note.trim(),
    });
    onClose();
  };

  const unitLabel = unit === 'placa' ? 'Placa' : unit;

  return (
    <Sheet open onClose={onClose} title={title} subtitle="Séries planejadas">
      <div className="set-row head" style={{ gridTemplateColumns: '84px minmax(0,1fr) minmax(0,1fr) 40px' }}>
        <span>Tipo</span>
        <span style={{ textAlign: 'center' }}>Reps</span>
        <span style={{ textAlign: 'center' }}>{unitLabel}</span>
        <span />
      </div>
      <div className="sets">
        {sets.map((s, i) => (
          <div key={i} className="set-row" style={{ gridTemplateColumns: '84px minmax(0,1fr) minmax(0,1fr) 40px' }}>
            <select
              className="select"
              style={{ minHeight: 40, height: 40, fontSize: 14, padding: '0 28px 0 10px', backgroundPosition: 'right 6px center' }}
              value={s.type}
              aria-label={`Tipo da série ${i + 1}`}
              onChange={(e) => update(i, { type: e.target.value as SetType })}
            >
              {SET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === 'N' ? 'Normal' : t.name}
                </option>
              ))}
            </select>
            <input
              className="set-input"
              value={s.reps}
              placeholder="10"
              aria-label={`Repetições da série ${i + 1}`}
              onChange={(e) => update(i, { reps: e.target.value })}
            />
            <input
              className="set-input"
              value={s.load}
              inputMode="decimal"
              placeholder="—"
              aria-label={`Carga da série ${i + 1}`}
              onChange={(e) => update(i, { load: e.target.value })}
            />
            <button
              type="button"
              className="icon-btn ghost"
              style={{ width: 40, minWidth: 40, color: 'var(--danger)' }}
              aria-label={`Remover série ${i + 1}`}
              onClick={() => setSets((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn small soft"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setSets((prev) => [...prev, { type: 'N', reps: prev[prev.length - 1]?.reps ?? '10', load: prev[prev.length - 1]?.load ?? '' }])}
      >
        <Icon name="plus" size={18} /> Adicionar série
      </button>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>
        Repetições aceitam faixa (ex.: 8-12). A carga é só uma sugestão: no treino o app puxa o que você fez da última vez.
      </span>
      <label className="field">
        <span className="label">Método ou observação</span>
        <input className="input" value={note} placeholder="Drop-set na última série" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn big block primary" onClick={save}>
        Salvar séries
      </button>
    </Sheet>
  );
}
