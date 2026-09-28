import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart } from '../components/Charts';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { ExerciseMedia } from '../components/Media';
import { equipmentName, loadText, UNITS } from '../lib/equipment';
import { useExercises } from '../lib/exercises';
import { dayMonth, num } from '../lib/format';
import { muscleName } from '../lib/muscles';
import { savePref } from '../lib/repo';
import { exerciseHistory, type HistoryPoint } from '../lib/stats';
import type { LoadUnit } from '../lib/types';

export function setsSummary(p: HistoryPoint): string {
  const work = p.sets.filter((s) => s.type !== 'A');
  if (work.length === 0) return `${p.sets.length} séries`;
  const reps = [...new Set(work.map((s) => s.reps ?? 0))];
  const text = `${work.length} × ${reps.join('/')}`;
  return p.best !== null ? `${text} · ${loadText(p.best, p.unit)}` : text;
}

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const { map, ready } = useExercises();
  const { toast } = useDialogs();
  const [tab, setTab] = useState<'prog' | 'como'>('prog');
  const [showAll, setShowAll] = useState(false);
  const history = useLiveQuery(() => exerciseHistory(exerciseId), [exerciseId]);
  const ex = map.get(exerciseId);

  const [note, setNote] = useState('');
  const [video, setVideo] = useState('');
  useEffect(() => {
    setNote(ex?.note ?? '');
    setVideo(ex?.custom ? '' : ex?.videoUrl ?? '');
  }, [ex?.id, ex?.note, ex?.videoUrl, ex?.custom]);

  if (!ready) return <main className="screen no-tabs" />;
  if (!ex) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton />} />
        <EmptyState title="Exercício não encontrado" action={{ label: 'Ver biblioteca', to: '/exercicios' }} />
      </main>
    );
  }

  const points = (history ?? []).filter((p) => p.unit === ex.unit && p.best !== null);
  const all = history ?? [];
  const record = points.reduce<number | null>((m, p) => (m === null || (p.best ?? 0) > m ? p.best : m), null);
  const first = points[0]?.best ?? null;
  const last = points[points.length - 1]?.best ?? null;
  const recent = [...all].reverse();
  const shown = showAll ? recent : recent.slice(0, 5);

  const saveUnit = async (u: LoadUnit) => {
    await savePref(ex.id, { unit: u });
    toast('Unidade salva');
  };

  return (
    <main className="screen no-tabs tight">
      <TopBar
        left={<BackButton />}
        right={
          ex.custom ? (
            <Link to={`/exercicios/${ex.id}/editar`} className="text-btn" style={{ display: 'flex', alignItems: 'center' }}>
              Editar
            </Link>
          ) : undefined
        }
      />
      <ExerciseMedia exercise={ex} height={230} />
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="display" style={{ fontSize: 30 }}>
          {ex.name}
        </h1>
        <div className="pills">
          <span className="chip neutral">{muscleName(ex.primary)}</span>
          {ex.secondary.map((m) => (
            <span key={m} className="chip neutral" style={{ color: 'var(--text-2)' }}>
              {muscleName(m)}
            </span>
          ))}
          <span className="chip outline">{equipmentName(ex.equipment)}</span>
          {ex.custom && <span className="chip soft-accent">Criado por você</span>}
        </div>
      </div>

      <div className="seg">
        <button type="button" className={tab === 'prog' ? 'on' : ''} aria-pressed={tab === 'prog'} onClick={() => setTab('prog')}>
          Progresso
        </button>
        <button type="button" className={tab === 'como' ? 'on' : ''} aria-pressed={tab === 'como'} onClick={() => setTab('como')}>
          Como fazer
        </button>
      </div>

      {tab === 'prog' ? (
        all.length === 0 ? (
          <EmptyState title="Você ainda não fez este exercício" text="Depois do primeiro treino, a evolução da carga aparece aqui." />
        ) : (
          <>
            <div className="grid-3" style={{ gap: 8 }}>
              <div className="tile">
                <span className="tiny muted">Recorde</span>
                <span className="tile-value" style={{ fontSize: 24 }}>
                  {record !== null ? loadText(record, ex.unit) : '—'}
                </span>
              </div>
              <div className="tile">
                <span className="tiny muted">Evolução</span>
                <span className="tile-value" style={{ fontSize: 24, color: 'var(--accent)' }}>
                  {first !== null && last !== null ? `${last - first >= 0 ? '+' : ''}${num(last - first)}` : '—'}
                </span>
              </div>
              <div className="tile">
                <span className="tiny muted">Feito</span>
                <span className="tile-value" style={{ fontSize: 24 }}>
                  {all.length} {all.length === 1 ? 'vez' : 'vezes'}
                </span>
              </div>
            </div>
            {points.length >= 2 && (
              <LineChart points={points.slice(-20).map((p) => ({ label: dayMonth(p.date), value: p.best as number }))} height={140} />
            )}
            <div className="list-group">
              {shown.map((p) => {
                const isRecord = record !== null && p.best === record && p.unit === ex.unit;
                return (
                  <Link key={p.sessionId} to={`/sessao/${p.sessionId}/resumo`} className="list-item" style={{ minHeight: 44 }}>
                    <span className="small muted" style={{ width: 44 }}>
                      {dayMonth(p.date)}
                    </span>
                    <span className="grow" style={{ fontSize: 14, fontWeight: 700 }}>
                      {setsSummary(p)}
                    </span>
                    {isRecord && (
                      <span className="chip record">
                        <Icon name="trophy" size={14} /> Recorde
                      </span>
                    )}
                  </Link>
                );
              })}
              {recent.length > 5 && (
                <button type="button" className="list-item" style={{ color: 'var(--accent)', minHeight: 44 }} onClick={() => setShowAll((v) => !v)}>
                  <span className="grow">{showAll ? 'Mostrar menos' : `Ver histórico completo (${recent.length})`}</span>
                </button>
              )}
            </div>
          </>
        )
      ) : (
        <>
          {ex.steps.length > 0 && (
            <ol className="steps">
              {ex.steps.map((s, i) => (
                <li key={i}>
                  <span className="n">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
          {ex.tips && (
            <div className="card flat stack" style={{ gap: 4 }}>
              <span className="eyebrow muted">Dicas</span>
              <span style={{ lineHeight: 1.5 }}>{ex.tips}</span>
            </div>
          )}
          <label className="field">
            <span className="label">Sua anotação</span>
            <textarea
              className="textarea"
              value={note}
              placeholder="Pegada com o dedo mínimo na marca da barra"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note !== (ex.note ?? '')) void savePref(ex.id, { note: note.trim() });
              }}
            />
          </label>
          {!ex.custom && (
            <label className="field">
              <span className="label">Seu vídeo de referência (opcional)</span>
              <input
                className="input"
                type="url"
                value={video}
                placeholder="Link do YouTube"
                onChange={(e) => setVideo(e.target.value)}
                onBlur={() => {
                  if (video !== (ex.videoUrl ?? '')) void savePref(ex.id, { videoUrl: video.trim() || undefined });
                }}
              />
            </label>
          )}
          <div className="field">
            <span className="label">Como anotar a carga</span>
            <div className="seg">
              {UNITS.map((u) => (
                <button type="button" key={u.id} className={ex.unit === u.id ? 'on' : ''} aria-pressed={ex.unit === u.id} onClick={() => saveUnit(u.id)}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
