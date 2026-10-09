import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSlideNavigate } from '../lib/nav';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, LoadingScreen, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { Sheet } from '../components/Sheet';
import { isCardio } from '../lib/cardio';
import { db } from '../lib/db';
import { exerciseOrMissing, useExercises, type ExerciseView } from '../lib/exercises';
import { combineDateTime, dayMonth, duration, longDate, num, parseNum, timeHM, todayISO } from '../lib/format';
import {
  createManualSession,
  deleteSession,
  itemsOf,
  sessionItemsOf,
  updateSession,
  updateSessionItem,
  type ManualSet,
} from '../lib/repo';
import type { DoneSet, LoadUnit, PlannedSet } from '../lib/types';
import { repsText } from '../lib/workout';

const OTHER = '__outro__';

/** Uma série na tela: o que foi digitado (texto) e a sugestão em cinza. */
interface SetDraft {
  load: string;
  reps: string;
  hintLoad: string;
  hintReps: string;
}

/** Um exercício da lista "Exercícios feitos". */
interface Row {
  key: string;
  ex: ExerciseView;
  unit: LoadUnit;
  summary: string;
  /** Séries como estão (planejadas, ou as do treino ao editar). */
  base: DoneSet[] | PlannedSet[];
}

const textOf = (n: number | null | undefined) => (n === null || n === undefined ? '' : num(n, 2));

/** "3 × 8–12" a partir das séries planejadas. */
function plannedSummary(sets: PlannedSet[]): string {
  if (sets.length === 0) return '';
  const reps = [...new Set(sets.map((s) => s.reps).filter(Boolean))];
  return `${sets.length} × ${reps.length ? reps.map(repsText).join('/') : '—'}`;
}

/** "3 × 10/8 · 25 kg" a partir das séries feitas. */
function doneSummary(sets: DoneSet[], unit: LoadUnit): string {
  const done = sets.filter((s) => s.done && s.type !== 'A');
  if (done.length === 0) return `${sets.length} ${sets.length === 1 ? 'série' : 'séries'}`;
  const reps = [...new Set(done.map((s) => s.reps ?? 0))].join('/');
  const best = Math.max(...done.map((s) => s.load ?? 0));
  return `${done.length} × ${reps}${best > 0 ? ` · ${unit === 'placa' ? `placa ${num(best)}` : `${num(best)} ${unit}`}` : ''}`;
}

/** Cardio: "20 min" pela meta (ou pelo que foi feito). */
function cardioSummary(sets: { secs?: number | null }[]): string {
  const secs = sets.reduce((sum, s) => sum + (s.secs ?? 0), 0);
  return secs > 0 ? `${Math.round(secs / 60)} min` : 'Cardio';
}

export function DayEdit() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const go = useSlideNavigate();
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
    // Última vez de cada treino (para o menu "Qual treino você fez?").
    const lastByWorkout: Record<string, string> = {};
    for (const s of await db.sessions.filter((x) => !x.deleted && x.status === 'done' && !!x.workoutId).toArray()) {
      const id = s.workoutId!;
      if (!lastByWorkout[id] || s.date > lastByWorkout[id]) lastByWorkout[id] = s.date;
    }
    return { programs, workouts, session, items, lastByWorkout };
  }, [sessionId]);

  const [date, setDate] = useState(params.get('data') ?? todayISO());
  const [workoutId, setWorkoutId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, SetDraft[]>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Para um dia novo, lista os exercícios do treino escolhido (todos marcados como feitos).
  const plannedItems = useLiveQuery(
    async () => (isNew && workoutId && workoutId !== OTHER ? itemsOf(workoutId) : []),
    [isNew, workoutId],
  );
  useEffect(() => {
    if (!isNew || !plannedItems) return;
    setDone(Object.fromEntries(plannedItems.map((i) => [i.exerciseId, true])));
    setDrafts({});
    setOpenKey(null);
  }, [isNew, plannedItems]);

  const workoutGroups = useMemo(() => {
    if (!data) return [];
    return data.programs
      .map((p) => ({ program: p, workouts: data.workouts.filter((w) => w.programId === p.id).sort((a, b) => a.position - b.position) }))
      .filter((g) => g.workouts.length > 0);
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

  const rows: Row[] = isNew
    ? (plannedItems ?? []).map((i) => {
        const ex = exerciseOrMissing(map, i.exerciseId);
        return { key: i.exerciseId, ex, unit: ex.unit, summary: isCardio(ex.logType) ? cardioSummary(i.sets) : plannedSummary(i.sets), base: i.sets };
      })
    : data.items.map((i) => {
        const ex = exerciseOrMissing(map, i.exerciseId);
        return { key: i.id, ex, unit: i.unit, summary: isCardio(ex.logType) ? cardioSummary(i.sets) : doneSummary(i.sets, i.unit), base: i.sets };
      });
  const doneCount = rows.filter((r) => done[r.key]).length;
  const allDone = rows.length > 0 && doneCount === rows.length;

  /** Rascunho das séries de um exercício: o que já foi feito (ao editar) ou vazio com a sugestão. */
  const draftFor = (r: Row): SetDraft[] =>
    drafts[r.key] ??
    r.base.map((s) => {
      const doneSet = 'done' in s ? (s as DoneSet) : null;
      const filled = !!doneSet?.done;
      return {
        load: filled ? textOf(doneSet!.load) : '',
        reps: filled ? textOf(doneSet!.reps) : '',
        hintLoad: textOf(doneSet ? doneSet.load ?? doneSet.prevLoad : (s as PlannedSet).load),
        hintReps: doneSet ? textOf(doneSet.prevReps) || repsText(doneSet.target ?? '') : repsText((s as PlannedSet).reps ?? ''),
      };
    });

  const editDraft = (r: Row, index: number, field: 'load' | 'reps', value: string) => {
    const next = draftFor(r).map((d, i) => (i === index ? { ...d, [field]: value } : d));
    setDrafts((all) => ({ ...all, [r.key]: next }));
    // Anotar uma série marca o exercício como feito.
    if (value.trim()) setDone((d) => ({ ...d, [r.key]: true }));
  };
  const addSetRow = (r: Row) => {
    const cur = draftFor(r);
    const last = cur[cur.length - 1];
    setDrafts((all) => ({ ...all, [r.key]: [...cur, { load: '', reps: '', hintLoad: last?.load || last?.hintLoad || '', hintReps: last?.reps || last?.hintReps || '' }] }));
  };
  const typedOf = (r: Row): ManualSet[] => draftFor(r).map((d) => ({ load: parseNum(d.load), reps: parseNum(d.reps) }));

  const save = async () => {
    if (isNew) {
      const doneIds = Object.entries(done)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const setsByExercise: Record<string, ManualSet[]> = {};
      for (const r of rows) if (drafts[r.key]) setsByExercise[r.key] = typedOf(r);
      await createManualSession({
        date,
        workoutId: workoutId && workoutId !== OTHER ? workoutId : null,
        title: derivedTitle,
        startedAt: startMs,
        endedAt: endMs,
        note: note.trim(),
        doneExerciseIds: doneIds,
        setsByExercise,
      });
      toast('Treino adicionado');
      go(-1);
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
      const r = rows.find((x) => x.key === it.id)!;
      const wasDone = it.done || it.sets.some((x) => x.done);
      const changes: { done?: boolean; sets?: DoneSet[] } = {};
      if (drafts[it.id]) {
        // Séries anotadas: preenchidas viram feitas; as vazias ficam como não feitas.
        changes.sets = typedOf(r).map((t, i) => {
          const old = it.sets[i];
          const filled = t.load !== null || t.reps !== null;
          return old
            ? { ...old, load: filled ? t.load : old.load, reps: filled ? t.reps : null, done: filled }
            : { type: 'N' as const, load: t.load, reps: t.reps, done: filled, extra: true };
        });
      }
      if (done[it.id] !== undefined && done[it.id] !== wasDone) changes.done = done[it.id];
      if (changes.sets || changes.done !== undefined) await updateSessionItem(it.id, changes);
    }
    toast('Treino atualizado');
    go(-1);
  };

  const remove = async () => {
    if (!data.session) return;
    const ok = await confirm({
      title: 'Apagar este treino?',
      message: 'Ele sai do calendário e do histórico.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    await deleteSession(data.session.id);
    go('/calendario', { dir: 'back', replace: true });
  };

  const unitHead = (u: LoadUnit) => (u === 'placa' ? 'Placa' : u);

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          <button type="button" className="glass pill accent-text" onClick={() => go(-1)}>
            Cancelar
          </button>
        }
        title={isNew ? 'Adicionar treino' : 'Editar treino'}
        right={
          <button type="button" className="pill-primary" onClick={save}>
            Salvar
          </button>
        }
      />

      {/* Data, treino e horário em linhas, no padrão do app (sem a roleta do sistema para o treino). */}
      <div className="form-group">
        <label className="form-row">
          <span className="form-key">Data</span>
          <span className="form-value">{longDate(date)}</span>
          <Icon name="next" size={16} color="var(--muted)" />
          {/* O seletor de data do sistema abre ao tocar em qualquer parte da linha. */}
          <input className="form-overlay" type="date" value={date} max={todayISO()} aria-label="Data" onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {isNew ? (
          <button type="button" className={`form-row chooser-title-row ${pickerOpen ? 'open' : ''}`} aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}>
            <span className="form-key">Treino</span>
            <span className="form-value ellipsis">{workoutId === OTHER ? 'Outra atividade' : derivedTitle || 'Escolher'}</span>
            <span className="caret">
              <Icon name="caret" size={12} stroke={2.5} color="var(--accent)" />
            </span>
          </button>
        ) : (
          <label className="form-row">
            <span className="form-key">Nome</span>
            <input className="form-input" value={title} aria-label="Nome do treino" onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {isNew && workoutId === OTHER && (
          <label className="form-row">
            <span className="form-key">Qual atividade?</span>
            <input className="form-input" value={title} placeholder="Corrida na esteira" onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        <div className="form-row">
          <span className="form-key">Horário</span>
          <input className="form-time" type="time" value={start} aria-label="Início" onChange={(e) => setStart(e.target.value)} />
          <span className="muted">–</span>
          <input className="form-time" type="time" value={end} aria-label="Fim" onChange={(e) => setEnd(e.target.value)} />
          {minutes !== null && <span className="small muted form-dur">{duration(minutes)}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <div className="section-head form-section">
            <span>
              Exercícios feitos · {doneCount} de {rows.length}
            </span>
            <button type="button" className="sum-reopen" onClick={() => setDone(Object.fromEntries(rows.map((r) => [r.key, !allDone])))}>
              {allDone ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>
          <div className="form-group">
            {rows.map((r) => {
              const cardio = isCardio(r.ex.logType);
              const open = openKey === r.key;
              const draft = open ? draftFor(r) : [];
              return (
                <div key={r.key} className="done-ex">
                  <div className="done-ex-row">
                    <span className="done-ex-thumb">
                      <ExerciseThumb exercise={r.ex} />
                    </span>
                    <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
                      <span className="ellipsis" style={{ fontWeight: 600 }}>
                        {r.ex.name}
                      </span>
                      <span className="tiny muted">
                        {r.summary}
                        {!cardio && (
                          <>
                            {r.summary ? ' · ' : ''}
                            <button type="button" className="done-ex-toggle" aria-expanded={open} onClick={() => setOpenKey(open ? null : r.key)}>
                              {isNew ? 'Anotar cargas' : 'Ver séries'} {open ? '▴' : '▾'}
                            </button>
                          </>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={`done-check ${done[r.key] ? 'on' : ''}`}
                      aria-pressed={!!done[r.key]}
                      aria-label={done[r.key] ? `Desmarcar ${r.ex.name}` : `Marcar ${r.ex.name} como feito`}
                      onClick={() => setDone((d) => ({ ...d, [r.key]: !d[r.key] }))}
                    >
                      <Icon name="check" size={15} stroke={3} />
                    </button>
                  </div>
                  {open && (
                    <div className="done-sets">
                      <span />
                      <span className="done-sets-head">{unitHead(r.unit)}</span>
                      <span className="done-sets-head">Reps</span>
                      {draft.map((d, i) => (
                        <div key={i} className="done-sets-line">
                          <span className="muted">{i + 1}</span>
                          <input
                            className="done-sets-input"
                            inputMode="decimal"
                            value={d.load}
                            placeholder={d.hintLoad}
                            aria-label={`${unitHead(r.unit)} da série ${i + 1}`}
                            onChange={(e) => editDraft(r, i, 'load', e.target.value)}
                          />
                          <input
                            className="done-sets-input"
                            inputMode="numeric"
                            value={d.reps}
                            placeholder={d.hintReps}
                            aria-label={`Repetições da série ${i + 1}`}
                            onChange={(e) => editDraft(r, i, 'reps', e.target.value)}
                          />
                        </div>
                      ))}
                      <button type="button" className="done-ex-toggle done-sets-add" onClick={() => addSetRow(r)}>
                        + Adicionar série
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <span className="tiny muted" style={{ padding: '0 4px' }}>
            {isNew ? 'Anotar as cargas é opcional. Só entram as séries que você preencher.' : 'Séries vazias ficam como não feitas.'}
          </span>
        </section>
      )}

      <label className="field">
        <span className="label">Observação</span>
        <textarea className="textarea" value={note} placeholder="Como foi o treino?" onChange={(e) => setNote(e.target.value)} />
      </label>

      {!isNew && (
        <button type="button" className="text-danger-btn" onClick={remove}>
          Apagar este treino
        </button>
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Qual treino você fez?">
        <div className="chooser-list">
          {workoutGroups.map(({ program, workouts }) => (
            <div key={program.id}>
              <span className="chooser-label">
                {program.name}
                {program.status === 'active' ? ' · ativa' : ''}
              </span>
              <div className="chooser-group">
                {workouts.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="chooser-row"
                    onClick={() => {
                      setWorkoutId(w.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="letter-tile">{w.letter}</span>
                    <span className="col grow" style={{ gap: 1, minWidth: 0 }}>
                      <span className="ellipsis" style={{ fontWeight: 600 }}>
                        {w.name}
                      </span>
                      <span className="tiny muted">{data.lastByWorkout[w.id] ? `feito ${dayMonth(data.lastByWorkout[w.id])}` : 'ainda não feito'}</span>
                    </span>
                    {workoutId === w.id && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <span className="chooser-label">Outros</span>
          <div className="chooser-group">
            <button
              type="button"
              className="chooser-row"
              onClick={() => {
                setWorkoutId(OTHER);
                setPickerOpen(false);
              }}
            >
              <span className="letter-tile">
                <Icon name="heart" size={18} />
              </span>
              <span className="col grow" style={{ gap: 1 }}>
                <span style={{ fontWeight: 600 }}>Outra atividade</span>
                <span className="tiny muted">cardio, aula, esporte…</span>
              </span>
              {workoutId === OTHER && <Icon name="check" size={18} stroke={3} color="var(--accent)" />}
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
