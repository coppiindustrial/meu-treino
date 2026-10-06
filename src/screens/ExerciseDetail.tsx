import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { TrendChart } from '../components/Charts';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, LoadingScreen, TopBar } from '../components/Layout';
import { LogTypePicker } from '../components/LogTypePicker';
import { ExerciseMedia, ExerciseThumb } from '../components/Media';
import { MuscleFigure } from '../components/MuscleFigure';
import { cardioTotals, distText, formatDuration, isCardio, logTypeName } from '../lib/cardio';
import { equipmentName, loadText, setLabels, UNITS } from '../lib/equipment';
import { useExercises, type ExerciseView } from '../lib/exercises';
import { addDays, dayMonth, longDate, num, shortDate, timeHM, todayISO } from '../lib/format';
import { isGroup, muscleName } from '../lib/muscles';
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
  // Em placa, o volume é "nº da placa × reps" (não é peso) e o 1RM não faz sentido.
  const vol = u === 'placa' ? volText : load;
  return [
    { name: 'Maior peso', value: (p) => p.best, show: load },
    ...(u === 'placa' ? [] : [{ name: '1RM estimado', value: (p: HistoryPoint) => (work(p.sets).length ? Math.max(...work(p.sets).map(oneRm)) : null), show: load }]),
    { name: 'Melhor volume de série', value: (p) => (work(p.sets).length ? Math.max(...work(p.sets).map(setVolume)) : null), show: vol },
    { name: 'Volume no treino', value: (p) => work(p.sets).reduce((a, s) => a + setVolume(s), 0) || null, show: vol },
  ];
}

const volText = (v: number) => `${num(v, 0)} placas×reps`;

const TABS = ['Resumo', 'Histórico', 'Instruções', 'Ajustes'] as const;
const TAB_SLUGS = ['resumo', 'historico', 'instrucoes', 'ajustes'];

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const { map, ready } = useExercises();
  const { toast } = useDialogs();
  // A aba fica no endereço (?aba=historico): ao voltar de um treino aberto pelo Histórico, ela reabre ali.
  const [params, setParams] = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(params.get('aba') ?? 'resumo'));
  const setTab = (i: number) => {
    const next = new URLSearchParams(params);
    if (i === 0) next.delete('aba');
    else next.set('aba', TAB_SLUGS[i]);
    setParams(next, { replace: true });
  };
  const [metricIdx, setMetricIdx] = useState(0);
  const history = useLiveQuery(() => exerciseHistory(exerciseId), [exerciseId]);
  // Outro exercício: volta para a primeira métrica (a aba vem do endereço, que é outro).
  useEffect(() => {
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
            <Summary key={metric.name} metric={metric} series={series} />
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
          {all
            .map((p, i) => <HistoryCard key={p.itemId} p={p} earlier={all.slice(0, i)} />)
            .reverse()}
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
                {/* Cardio, alongamento e mobilidade não são um músculo: o desenho mostra o primeiro que trabalha. */}
                <MuscleFigure muscle={isGroup(ex.primary) && ex.secondary[0] ? ex.secondary[0] : ex.primary} size={72} />
              </span>
              <span className="col" style={{ gap: 3 }}>
                {isGroup(ex.primary) ? (
                  <>
                    <span style={{ fontWeight: 600 }}>{muscleName(ex.primary)}</span>
                    {ex.secondary.length > 0 && <span className="small muted">Trabalha: {ex.secondary.map(muscleName).join(', ')}</span>}
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 600 }}>Principal: {muscleName(ex.primary)}</span>
                    {ex.secondary.length > 0 && <span className="small muted">Também trabalha: {ex.secondary.map(muscleName).join(', ')}</span>}
                  </>
                )}
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

/** Diferença de carga para o texto do selo: "+1 placa", "−2,5 kg". */
function loadDiffText(diff: number, unit: LoadUnit): string {
  const sign = diff > 0 ? '+' : '−';
  const n = num(Math.abs(diff), 2);
  if (unit === 'placa') return `${sign}${n} ${Math.abs(diff) === 1 ? 'placa' : 'placas'}`;
  return `${sign}${n} ${unit}`;
}

/** Um treino no histórico do exercício: tabela de séries, recorde e comparação com o treino anterior. */
function HistoryCard({ p, earlier }: { p: HistoryPoint; earlier: HistoryPoint[] }) {
  const cardio = isCardio(p.logType);
  const labels = setLabels(p.sets.map((x) => x.type));
  const comparable = earlier.filter((q) => q.unit === p.unit && isCardio(q.logType) === cardio);
  const prev = comparable[comparable.length - 1];

  // Recorde: a melhor carga deste dia passou de todas as anteriores (na mesma unidade).
  const priorBests = comparable.map((q) => q.best).filter((v): v is number => v !== null);
  const record = !cardio && p.best !== null && priorBests.length > 0 && p.best > Math.max(...priorBests);
  const recordIdx = record ? p.sets.findIndex((s) => s.type !== 'A' && s.load === p.best && s.reps === p.bestReps) : -1;

  let delta: { text: string; tone: 'up' | 'down' | 'same' } | null = null;
  if (!cardio && prev && p.best !== null && prev.best !== null) {
    const diff = Math.round((p.best - prev.best) * 100) / 100;
    if (diff !== 0) {
      delta = { text: `${diff > 0 ? '↑' : '↓'} ${loadDiffText(diff, p.unit)} vs anterior`, tone: diff > 0 ? 'up' : 'down' };
    } else {
      const reps = (p.bestReps ?? 0) - (prev.bestReps ?? 0);
      delta =
        reps !== 0
          ? { text: `${reps > 0 ? '↑' : '↓'} ${reps > 0 ? '+' : '−'}${Math.abs(reps)} reps na melhor série`, tone: reps > 0 ? 'up' : 'down' }
          : { text: '= igual ao anterior', tone: 'same' };
    }
  }
  const work = p.sets.filter((s) => s.type !== 'A');
  const totalReps = work.reduce((a, s) => a + (s.reps ?? 0), 0);
  const withDist = cardio && p.logType !== 'tempo';

  return (
    <Link to={`/sessao/${p.sessionId}/resumo`} className="card hist-card">
      <span className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="col" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{longDate(p.date)}</span>
          <span className="tiny muted ellipsis">
            {p.title}
            {p.startedAt ? ` · ${timeHM(p.startedAt)}` : ''}
          </span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          {p.extra && <span className="chip soft-accent">Extra no treino</span>}
          <Icon name="next" size={18} color="var(--muted)" />
        </span>
      </span>
      <div className={`hist-table ${cardio && !withDist ? 'c-t' : ''}`}>
        <div className="hist-row head">
          <span>Série</span>
          {cardio ? (
            <>
              {withDist && <span>{p.distUnit}</span>}
              <span>Tempo</span>
            </>
          ) : (
            <>
              <span>Carga</span>
              <span>Reps</span>
            </>
          )}
          <span />
        </div>
        {p.sets.map((s, i) => {
          const warm = s.type === 'A';
          return (
            <div key={i} className={`hist-row ${warm ? 'warm' : ''} ${i === recordIdx ? 'rec' : ''}`}>
              <span className={warm ? 'st-a' : 'muted'}>{labels[i]}</span>
              {cardio ? (
                <>
                  {withDist && <span>{s.dist !== null && s.dist !== undefined ? distText(s.dist, p.distUnit).replace(/ (km|m)$/, '') : '—'}</span>}
                  <span>{formatDuration(s.secs) || '—'}</span>
                </>
              ) : (
                <>
                  <span>{loadText(s.load, p.unit) || '—'}</span>
                  <span>{s.reps ?? '—'}</span>
                </>
              )}
              <span className="hist-icon">{i === recordIdx && <Icon name="trophy" size={16} color="var(--record)" />}</span>
            </div>
          );
        })}
      </div>
      <span className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {delta && <span className={`chip ${delta.tone === 'up' ? 'up' : 'neutral'}`}>{delta.text}</span>}
        {cardio ? (
          <span className="chip neutral">{setsSummary(p)}</span>
        ) : (
          totalReps > 0 && <span className="chip neutral">{totalReps} reps</span>
        )}
        {record && <span className="chip record">Recorde</span>}
      </span>
    </Link>
  );
}

const SUMMARY_PERIODS = [
  { id: '1m', name: 'Último mês', days: 31 },
  { id: '3m', name: 'Últimos 3 meses', days: 92 },
  { id: '6m', name: 'Últimos 6 meses', days: 183 },
  { id: '1a', name: 'Último ano', days: 366 },
  { id: 'tudo', name: 'Tudo', days: 0 },
];

/** Valor do ponto escolhido no gráfico (o último, se nenhum), período e a evolução no período. */
function Summary({ metric, series }: { metric: Metric; series: { p: HistoryPoint; v: number }[] }) {
  const [period, setPeriod] = useState('3m');
  const [picked, setPicked] = useState<number | null>(null);
  const days = SUMMARY_PERIODS.find((p) => p.id === period)?.days ?? 0;
  const cutoff = days ? addDays(todayISO(), -days) : '';
  const points = series.filter((x) => x.p.date >= cutoff).map((x) => ({ date: x.p.date, value: x.v }));
  const sel = picked === null ? points.length - 1 : Math.min(picked, points.length - 1);
  const current = points[sel];
  const diff = points.length > 1 ? points[points.length - 1].value - points[0].value : 0;
  const better = metric.lowerIsBetter ? diff < 0 : diff > 0;
  // Eixo: tempo e ritmo em minutos:segundos; o resto em número (sem a unidade, para caber).
  const timeAxis = metric.lowerIsBetter || metric.name === 'Tempo';
  const axis = (v: number) => (timeAxis ? formatDuration(Math.max(0, Math.round(v))) || '0:00' : num(v, 1));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="row" style={{ alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span className="sum-metric-value">{current ? metric.show(current.value) : '—'}</span>
          {current && <span className="small accent-text">{shortDate(current.date)}</span>}
        </span>
        <label className="period-select small accent-text">
          {SUMMARY_PERIODS.find((p) => p.id === period)?.name}
          <Icon name="down" size={16} />
          <select
            value={period}
            aria-label="Período do gráfico"
            onChange={(e) => {
              setPeriod(e.target.value);
              setPicked(null);
            }}
          >
            {SUMMARY_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {diff !== 0 && (
        <span className="small" style={{ color: better ? 'var(--success)' : 'var(--text-2)', fontWeight: 600 }}>
          {better ? '↑' : '↓'} {better ? (metric.lowerIsBetter ? 'Mais rápido' : 'Subiu') : metric.lowerIsBetter ? 'Mais lento' : 'Caiu'}{' '}
          {metric.show(Math.abs(diff)).replace(/^-/, '')} desde {shortDate(points[0].date)}
        </span>
      )}
      {points.length > 0 ? (
        <TrendChart points={points} selected={sel} onSelect={setPicked} axis={axis} unit={timeAxis ? 60 : 0} />
      ) : (
        <p className="small muted" style={{ padding: '24px 0', textAlign: 'center' }}>
          Sem treinos neste período.
        </p>
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
    const volume = (v: number) => (u === 'placa' ? volText(v) : loadText(v, u));
    if (rm && u !== 'placa') rows.push({ name: 'Melhor 1RM', value: loadText(Math.round(rm.v * 10) / 10, u), note: `${loadText(rm.s.load, u)} × ${rm.s.reps}` });
    if (vol) rows.push({ name: 'Melhor volume de série', value: volume(vol.v), note: `${loadText(vol.s.load, u)} × ${vol.s.reps}` });
    const session = bestBy((p) => work(p.sets).reduce((a, s) => a + setVolume(s), 0) || null);
    if (session) rows.push({ name: 'Melhor volume de treino', value: volume(session.v), note: dayMonth(session.p.date) });
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
