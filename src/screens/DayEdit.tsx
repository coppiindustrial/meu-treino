import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, LoadingScreen, TopBar } from '../components/Layout';
import { db } from '../lib/db';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { combineDateTime, duration, timeHM, todayISO } from '../lib/format';
import {
  createManualSession,
  deleteSession,
  itemsOf,
  sessionItemsOf,
  setSessionItemDoneFlag,
  updateSession,
} from '../lib/repo';

const OTHER = '__outro__';

export function DayEdit() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const { map } = useExercises();
  const isNew = !sessionId;

  const data = useLiveQuery(async () => {
    const programs = (await db.programs.filter((p) => !p.deleted).toArray()).sort((a, b) =>
      a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.createdAt - a.createdAt,
    );
    const workouts = await db.workouts.filter((w) => !w.deleted).toArray();
    const session = sessionId ? await db.sessions.get(sessionId) : undefined;
    const items = sessionId ? await sessionItemsOf(sessionId) : [];
    return { programs, workouts, session, items };
  }, [sessionId]);

  const [date, setDate] = useState(params.get('data') ?? todayISO());
  const [workoutId, setWorkoutId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  // Preenche o formulário ao editar um dia existente.
  useEffect(() => {
    if (!data || loaded) return;
    if (data.session) {
      const s = data.session;
      setDate(s.date);
      setWorkoutId(s.workoutId ?? OTHER);
      setTitle(s.title);
      setStart(s.startedAt ? timeHM(s.startedAt) : '');
      setEnd(s.endedAt ? timeHM(s.endedAt) : '');
      setNote(s.note ?? '');
      setDone(Object.fromEntries(data.items.map((i) => [i.id, i.done || i.sets.some((x) => x.done)])));
    } else if (isNew) {
      const active = data.programs.find((p) => p.status === 'active');
      const first = data.workouts.filter((w) => w.programId === active?.id).sort((a, b) => a.position - b.position)[0];
      setWorkoutId(first?.id ?? OTHER);
    }
    setLoaded(true);
  }, [data, loaded, isNew]);

  // Para um dia novo, lista os exercícios do treino escolhido.
  const plannedItems = useLiveQuery(
    async () => (isNew && workoutId && workoutId !== OTHER ? itemsOf(workoutId) : []),
    [isNew, workoutId],
  );
  useEffect(() => {
    if (isNew && plannedItems) setDone(Object.fromEntries(plannedItems.map((i) => [i.exerciseId, true])));
  }, [isNew, plannedItems]);

  const workoutOptions = useMemo(() => {
    if (!data) return [];
    return data.programs.map((p) => ({
      program: p,
      workouts: data.workouts.filter((w) => w.programId === p.id).sort((a, b) => a.position - b.position),
    }));
  }, [data]);

  if (!data) return <LoadingScreen back="/calendario" />;
  if (!isNew && !data.session) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton />} />
        <p className="muted">Esse treino não existe mais.</p>
      </main>
    );
  }

  const startMs = start ? combineDateTime(date, start) : null;
  let endMs = end ? combineDateTime(date, end) : null;
  if (startMs && endMs && endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
  const minutes = startMs && endMs ? (endMs - startMs) / 60000 : null;

  const selectedWorkout = data.workouts.find((w) => w.id === workoutId);
  const derivedTitle = workoutId === OTHER ? title.trim() || 'Outra atividade' : selectedWorkout ? `${selectedWorkout.letter} · ${selectedWorkout.name}` : title;

  const save = async () => {
    if (isNew) {
      const doneIds = Object.entries(done)
        .filter(([, v]) => v)
        .map(([k]) => k);
      await createManualSession({
        date,
        workoutId: workoutId && workoutId !== OTHER ? workoutId : null,
        title: derivedTitle,
        startedAt: startMs,
        endedAt: endMs,
        note: note.trim(),
        doneExerciseIds: doneIds,
      });
      toast('Treino adicionado');
      navigate(-1);
      return;
    }
    const s = data.session!;
    await updateSession(s.id, {
      date,
      title: title.trim() || s.title,
      startedAt: startMs,
      endedAt: endMs,
      note: note.trim(),
    });
    for (const it of data.items) {
      const wasDone = it.done || it.sets.some((x) => x.done);
      if (done[it.id] !== undefined && done[it.id] !== wasDone) await setSessionItemDoneFlag(it.id, done[it.id]);
    }
    toast('Dia atualizado');
    navigate(-1);
  };

  const remove = async () => {
    if (!data.session) return;
    const ok = await confirm({
      title: 'Apagar este dia?',
      message: 'O treino sai do calendário e do histórico.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    await deleteSession(data.session.id);
    navigate('/calendario', { replace: true });
  };

  const checklist = isNew
    ? (plannedItems ?? []).map((i) => ({ key: i.exerciseId, name: exerciseOrMissing(map, i.exerciseId).name }))
    : data.items.map((i) => ({ key: i.id, name: exerciseOrMissing(map, i.exerciseId).name }));

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          <button type="button" className="glass pill accent-text" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        }
        title={isNew ? 'Adicionar dia' : 'Editar dia'}
        right={
          <button type="button" className="pill-primary" onClick={save}>
            Salvar
          </button>
        }
      />

      <label className="field">
        <span className="label">Data</span>
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>

      {isNew ? (
        <label className="field">
          <span className="label">Treino feito</span>
          <select className="select" value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
            {workoutOptions.map(({ program, workouts }) =>
              workouts.length ? (
                <optgroup key={program.id} label={program.name}>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.letter} · {w.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
            <option value={OTHER}>Outra atividade (cardio, aula…)</option>
          </select>
        </label>
      ) : (
        <label className="field">
          <span className="label">Nome</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}

      {isNew && workoutId === OTHER && (
        <label className="field">
          <span className="label">Qual atividade?</span>
          <input className="input" value={title} placeholder="Corrida na esteira" onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}

      <div className="grid-2">
        <label className="field">
          <span className="label">Início</span>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Fim</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <span className="row small muted" style={{ gap: 6 }}>
        <Icon name="clock" size={16} />
        {minutes !== null ? `Duração: ${duration(minutes)}, calculada pelos horários` : 'Os horários são opcionais'}
      </span>

      {checklist.length > 0 && (
        <div className="field">
          <span className="label">Exercícios feitos</span>
          <div className="list-group">
            {checklist.map((c) => (
              <label key={c.key} className="list-item" style={{ minHeight: 46, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!done[c.key]}
                  onChange={(e) => setDone((d) => ({ ...d, [c.key]: e.target.checked }))}
                  style={{ width: 20, height: 20, accentColor: 'var(--accent)', margin: 0 }}
                />
                <span className="grow">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span className="label">Observação</span>
        <textarea className="textarea" value={note} placeholder="Como foi o treino?" onChange={(e) => setNote(e.target.value)} />
      </label>

      <span className="tiny muted" style={{ lineHeight: 1.5 }}>
        Você pode adicionar, mudar ou apagar qualquer dia, mesmo sem ter usado o cronômetro.
      </span>

      <button type="button" className="btn big primary block" onClick={save}>
        Salvar
      </button>
      {!isNew && (
        <button type="button" className="btn block danger" onClick={remove}>
          <Icon name="trash" size={18} /> Apagar este dia
        </button>
      )}
    </main>
  );
}
