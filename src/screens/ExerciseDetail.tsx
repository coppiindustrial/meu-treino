import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart } from '../components/Charts';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, LoadingScreen, TopBar } from '../components/Layout';
import { LogTypePicker } from '../components/LogTypePicker';
import { ExerciseMedia, ExerciseThumb } from '../components/Media';
import { MuscleFigure } from '../components/MuscleFigure';
import { cardioSetText, cardioTotals, distText, formatDuration, isCardio, logTypeName } from '../lib/cardio';
import { equipmentName, loadText, setLabels, UNITS } from '../lib/equipment';
import { useExercises, type ExerciseView } from '../lib/exercises';
import { dayMonth, fullDate, num } from '../lib/format';
import { muscleName } from '../lib/muscles';
import { savePref } from '../lib/repo';
import { exerciseHistory, type HistoryPoint } from '../lib/stats';
import type { DoneSet, LoadUnit } from '../lib/types';

export function setsSummary(p: HistoryPoint): string {
  if (isCardio(p.logType)) {
    const t = cardioTotals(p.sets, p.distUnit);
    return [t.km ? distText(p.distUnit === 'm' ? t.km * 1000 : t.km, p.distUnit) : '', t.secs ? formatDuration(t.secs) : ''].filter(Boolean).join(' · ') || `${p.sets.length} séries`;
  }
  const work = p.sets.filter((s) => s.type !== 'A');
  if (work.length === 0) return `${p.sets.length} séries`;
  const reps = [...new Set(work.map((s) => s.reps ?? 0))];
  const text = `${work.length} × ${reps.join('/')}`;
  return p.best !== null ? `${text} · ${loadText(p.best, p.unit)}` : text;
}

// ---------------------------------------------------------------- Métricas

const work = (sets: DoneSet[]) => sets.filter((s) => s.type !== 'A' && s.load !== null && (s.reps ?? 0) > 0);
/** 1RM estimado (fórmula de Epley): carga × (1 + reps / 30). */
const oneRm = (s: DoneSet) => (s.load ?? 0) * (1 + (s.reps ?? 0) / 30);
const setVolume = (s: DoneSet) => (s.load ?? 0) * (s.reps ?? 0);

interface Metric {
  name: string;
  value: (p: HistoryPoint) => number | null;
  show: (v: number) => string;
  /** Menor é melhor (ritmo). */
  lowerIsBetter?: boolean;
}

function metricsFor(ex: ExerciseView, cardio: boolean): Metric[] {
  const u = ex.unit;
  const load = (v: number) => loadText(Math.round(v * 10) / 10, u);
  if (cardio) {
    const km = (p: HistoryPoint) => cardioTotals(p.sets, p.distUnit).km;
    const secs = (p: HistoryPoint) => cardioTotals(p.sets, p.distUnit).secs;
    const list: Metric[] = [];
    if (ex.logType !== 'tempo') {
      list.push({ name: 'Distância', value: (p) => km(p) || null, show: (v) => (ex.distUnit === 'm' ? `${num(v * 1000, 0)} m` : `${num(v, 2)} km`) });
    }
    list.push({ name: 'Tempo', value: (p) => secs(p) || null, show: (v) => formatDuration(v) });
    if (ex.logType !== 'tempo') {
      list.push({
        name: 'Ritmo',
        value: (p) => (km(p) && secs(p) ? secs(p) / km(p) : null),
        show: (v) => `${formatDuration(v)} /km`,
        lowerIsBetter: true,
      });
    }
    return list;
  }
  return [
    { name: 'Maior peso', value: (p) => p.best, show: load },
    { name: '1RM estimado', value: (p) => (work(p.sets).length ? Math.max(...work(p.sets).map(oneRm)) : null), show: load },
    { name: 'Melhor volume de série', value: (p) => (work(p.sets).length ? Math.max(...work(p.sets).map(setVolume)) : null), show: load },
    { name: 'Volume no treino', value: (p) => work(p.sets).reduce((a, s) => a + setVolume(s), 0) || null, show: load },
  ];
}

const TABS = ['Resumo', 'Histórico', 'Instruções', 'Ajustes'] as const;

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const { map, ready } = useExercises();
  const { toast } = useDialogs();
  const [tab, setTab] = useState(0);
  const [metricIdx, setMetricIdx] = useState(0);
  const history = useLiveQuery(() => exerciseHistory(exerciseId), [exerciseId]);
  // Outro exercício: volta para o Resumo e a primeira métrica.
  useEffect(() => {
    setTab(0);
    setMetricIdx(0);
  }, [exerciseId]);
  const ex = map.get(exerciseId);

  const [note, setNote] = useState('');
  const [video, setVideo] = useState('');
  useEffect(() => {
    setNote(ex?.note ?? '');
    setVideo(ex?.custom ? '' : ex?.videoUrl ?? '');
  }, [ex?.id, ex?.note, ex?.videoUrl, ex?.custom]);

  if (!ready) return <LoadingScreen back="/exercicios" />;
  if (!ex) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton />} />
        <EmptyState title="Exercício não encontrado" action={{ label: 'Ver biblioteca', to: '/exercicios' }} />
      </main>
    );
  }

  const cardio = isCardio(ex.logType);
  const all = history ?? [];
  const relevant = all.filter((p) => (cardio ? true : p.unit === ex.unit && !isCardio(p.logType)));
  const metrics = metricsFor(ex, cardio);
  const metric = metrics[Math.min(metricIdx, metrics.length - 1)];
  const series = relevant.map((p) => ({ p, v: metric.value(p) })).filter((x): x is { p: HistoryPoint; v: number } => x.v !== null);

  const saveUnit = async (u: LoadUnit) => {
    await savePref(ex.id, { unit: u });
    toast('Unidade salva');
  };

  return (
    <main className="screen no-tabs tight">
      <TopBar
        left={<BackButton />}
        title="Exercício"
        right={
          ex.custom ? (
            <Link to={`/exercicios/${ex.id}/editar`} className="glass pill">
              Editar
            </Link>
          ) : undefined
        }
      />
      <div className="row" style={{ gap: 12 }}>
        <span className="ex-avatar big">
          <ExerciseThumb exercise={ex} />
        </span>
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="h1" style={{ fontSize: 20 }}>
            {ex.name}
          </h1>
          <span className="small muted">
            {muscleName(ex.primary)} · {equipmentName(ex.equipment)}
            {cardio ? ` · ${logTypeName(ex.logType)}` : ''}
          </span>
        </div>
      </div>

      <div className="ex-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
        <span className="ex-tabs-line" style={{ transform: `translateX(${tab * 100}%)` }} aria-hidden="true" />
      </div>

      {tab === 0 && (
        <div className="stack fade-in" key="resumo">
          {series.length === 0 ? (
            <EmptyState title="Ainda sem dados" text="Depois que você fizer este exercício num treino, a evolução aparece aqui." />
          ) : (
            <Summary metric={metric} series={series} />
          )}
          <div className="chips-scroll">
            {metrics.map((m, i) => (
              <button key={m.name} type="button" className={`ex-chip metric ${i === metricIdx ? 'on' : ''}`} onClick={() => setMetricIdx(i)}>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <Records ex={ex} cardio={cardio} points={relevant} />
        </div>
      )}

      {tab === 1 && (
        <div className="stack fade-in" key="hist">
          {all.length === 0 && <EmptyState title="Nenhum treino ainda" text="Os treinos com este exercício aparecem aqui." />}
          {[...all].reverse().map((p) => (
            <Link key={p.sessionId} to={`/sessao/${p.sessionId}/resumo`} className="card hist-card">
              <span className="row between">
                <span style={{ fontWeight: 600 }}>{fullDate(p.date)}</span>
                <Icon name="next" size={18} color="var(--muted)" />
              </span>
              {p.sets.map((s, i) => (
                <span key={i} className="hist-set">
                  <span className="muted">{setLabels(p.sets.map((x) => x.type))[i]}</span>
                  <span>{isCardio(p.logType) ? cardioSetText(s, p.distUnit) : `${loadText(s.load, p.unit)} × ${s.reps ?? '—'}`}</span>
                </span>
              ))}
            </Link>
          ))}
        </div>
      )}

      {tab === 2 && (
        <div className="stack-lg fade-in" key="inst">
          <ExerciseMedia exercise={ex} height={230} />
          {ex.steps.length > 0 && (
            <section className="stack">
              <span className="label">Como fazer</span>
              <ol className="steps">
                {ex.steps.map((s, i) => (
                  <li key={i}>
                    <span className="n">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {ex.tips && (
            <div className="card flat stack" style={{ gap: 4 }}>
              <span className="label">Dicas</span>
              <span style={{ lineHeight: 1.5 }}>{ex.tips}</span>
            </div>
          )}
          <section className="stack">
            <span className="label">Músculos</span>
            <div className="card row" style={{ gap: 14 }}>
              <span className="figure-wrap" style={{ width: 72, height: 72, minWidth: 72 }}>
                <MuscleFigure muscle={ex.primary} size={72} />
              </span>
              <span className="col" style={{ gap: 3 }}>
                <span style={{ fontWeight: 600 }}>Principal: {muscleName(ex.primary)}</span>
                {ex.secondary.length > 0 && <span className="small muted">Também trabalha: {ex.secondary.map(muscleName).join(', ')}</span>}
                <span className="small muted">Equipamento: {equipmentName(ex.equipment)}</span>
              </span>
            </div>
          </section>
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
        </div>
      )}

      {tab === 3 && (
        <div className="stack-lg fade-in" key="ajustes">
          <LogTypePicker
            value={ex.logType}
            distUnit={ex.distUnit}
            onType={(t) => void savePref(ex.id, { logType: t }).then(() => toast('Tipo de registro salvo'))}
            onDistUnit={(u) => void savePref(ex.id, { distUnit: u })}
          />
          {!cardio && (
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
          )}
        </div>
      )}
    </main>
  );
}

function Summary({ metric, series }: { metric: Metric; series: { p: HistoryPoint; v: number }[] }) {
  const last = series[series.length - 1].v;
  const first = series[0].v;
  const diff = last - first;
  const better = metric.lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">{metric.name}</span>
      <span style={{ fontSize: 28, fontWeight: 700 }}>{metric.show(last)}</span>
      {series.length > 1 && diff !== 0 && (
        <span className="small" style={{ color: better ? 'var(--success)' : 'var(--text-2)', fontWeight: 600 }}>
          {better ? (metric.lowerIsBetter ? 'Mais rápido' : 'Subiu') : metric.lowerIsBetter ? 'Mais lento' : 'Caiu'} desde {dayMonth(series[0].p.date)}:{' '}
          {metric.show(Math.abs(diff)).replace(/^-/, '')}
        </span>
      )}
      {series.length >= 2 ? (
        <LineChart
          points={series.slice(-20).map((x) => ({ label: dayMonth(x.p.date), value: metric.lowerIsBetter || metric.name === 'Tempo' ? Math.round((x.v / 60) * 10) / 10 : Math.round(x.v * 10) / 10 }))}
          height={150}
        />
      ) : (
        <p className="small muted">Faça este exercício mais vezes para ver o gráfico.</p>
      )}
    </div>
  );
}

function Records({ ex, cardio, points }: { ex: ExerciseView; cardio: boolean; points: HistoryPoint[] }) {
  if (points.length === 0) return null;
  const rows: { name: string; value: string; note: string }[] = [];
  const bestBy = (score: (p: HistoryPoint) => number | null, lower = false) => {
    let best: { p: HistoryPoint; v: number } | null = null;
    for (const p of points) {
      const v = score(p);
      if (v === null || !Number.isFinite(v) || v <= 0) continue;
      if (!best || (lower ? v < best.v : v > best.v)) best = { p, v };
    }
    return best;
  };
  if (cardio) {
    const km = (p: HistoryPoint) => cardioTotals(p.sets, p.distUnit).km;
    const secs = (p: HistoryPoint) => cardioTotals(p.sets, p.distUnit).secs;
    if (ex.logType !== 'tempo') {
      const d = bestBy((p) => km(p) || null);
      if (d) rows.push({ name: 'Maior distância', value: ex.distUnit === 'm' ? `${num(d.v * 1000, 0)} m` : `${num(d.v, 2)} km`, note: dayMonth(d.p.date) });
    }
    const t = bestBy((p) => secs(p) || null);
    if (t) rows.push({ name: 'Maior tempo', value: formatDuration(t.v), note: dayMonth(t.p.date) });
    if (ex.logType !== 'tempo') {
      const r = bestBy((p) => (km(p) && secs(p) ? secs(p) / km(p) : null), true);
      if (r) rows.push({ name: 'Melhor ritmo', value: `${formatDuration(r.v)} /km`, note: dayMonth(r.p.date) });
    }
  } else {
    const u = ex.unit;
    const heaviest = bestBy((p) => p.best);
    if (heaviest) rows.push({ name: 'Maior peso', value: loadText(heaviest.v, u), note: dayMonth(heaviest.p.date) });
    let rm: { s: DoneSet; v: number; p: HistoryPoint } | null = null;
    let vol: { s: DoneSet; v: number; p: HistoryPoint } | null = null;
    for (const p of points) {
      for (const s of work(p.sets)) {
        if (!rm || oneRm(s) > rm.v) rm = { s, v: oneRm(s), p };
        if (!vol || setVolume(s) > vol.v) vol = { s, v: setVolume(s), p };
      }
    }
    if (rm) rows.push({ name: 'Melhor 1RM', value: loadText(Math.round(rm.v * 10) / 10, u), note: `${loadText(rm.s.load, u)} × ${rm.s.reps}` });
    if (vol) rows.push({ name: 'Melhor volume de série', value: loadText(vol.v, u), note: `${loadText(vol.s.load, u)} × ${vol.s.reps}` });
    const session = bestBy((p) => work(p.sets).reduce((a, s) => a + setVolume(s), 0) || null);
    if (session) rows.push({ name: 'Melhor volume de treino', value: loadText(session.v, u), note: dayMonth(session.p.date) });
  }
  if (rows.length === 0) return null;
  return (
    <section className="stack">
      <span className="row" style={{ gap: 8, fontWeight: 600, marginTop: 8 }}>
        <Icon name="trophy" size={20} color="#f5b83d" /> Recordes pessoais
      </span>
      <div className="list-group">
        {rows.map((r) => (
          <div key={r.name} className="list-item" style={{ minHeight: 56 }}>
            <span className="col grow" style={{ gap: 1 }}>
              <span>{r.name}</span>
              <span className="tiny muted" style={{ fontWeight: 500 }}>
                {r.note}
              </span>
            </span>
            <span className="tnum" style={{ fontWeight: 600 }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
