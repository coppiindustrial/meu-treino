import { useEffect, useState } from 'react';
import { DEFAULT_INTERVAL, formatDuration } from '../lib/cardio';
import { useNow } from '../lib/hooks';
import { logTiro } from '../lib/repo';
import { beep, unlockAudio } from '../lib/sound';
import type { IntervalConfig } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

type Field = keyof IntervalConfig;
const FIELD_NAME: Record<Field, string> = { work: 'Tiro', rest: 'Descanso', rounds: 'Rodadas' };

/** Três botões (Tiro, Descanso, Rodadas) que abrem um ajuste com − e +. */
export function IntervalConfigButtons({
  value,
  onChange,
  disabled,
}: {
  value: IntervalConfig | undefined;
  onChange: (next: IntervalConfig) => void;
  disabled?: boolean;
}) {
  const cfg = value ?? DEFAULT_INTERVAL;
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState(cfg);
  const show = (f: Field, c: IntervalConfig) => (f === 'rounds' ? String(c.rounds) : formatDuration(c[f]));
  const step = (f: Field, dir: 1 | -1) =>
    setDraft((d) => ({ ...d, [f]: Math.max(f === 'rounds' ? 1 : f === 'rest' ? 0 : 15, d[f] + dir * (f === 'rounds' ? 1 : 15)) }));
  const total = cfg.rounds * cfg.work + Math.max(0, cfg.rounds - 1) * cfg.rest;

  return (
    <>
      <div className="interval-cfg">
        {(['work', 'rest', 'rounds'] as Field[]).map((f) => (
          <button
            key={f}
            type="button"
            className="btn soft"
            disabled={disabled}
            onClick={() => {
              setDraft(cfg);
              setEditing(f);
            }}
          >
            <span className="tiny muted">{FIELD_NAME[f]}</span>
            <b>{show(f, cfg)}</b>
          </button>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: '2px 2px 0' }}>
        Total: {formatDuration(total)} ({cfg.rounds} tiros de {formatDuration(cfg.work)}
        {cfg.rest ? ` com ${formatDuration(cfg.rest)} de descanso` : ' sem descanso'})
      </p>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? FIELD_NAME[editing] : undefined}>
        {editing && (
          <div className="stack-lg">
            <div className="stepper">
              <button type="button" className="glass circle" aria-label="Diminuir" onClick={() => step(editing, -1)}>
                <Icon name="minus" size={22} stroke={2.4} />
              </button>
              <b className="tnum">{show(editing, draft)}</b>
              <button type="button" className="glass circle" aria-label="Aumentar" onClick={() => step(editing, 1)}>
                <Icon name="plus" size={22} stroke={2.4} />
              </button>
            </div>
            <button
              type="button"
              className="btn primary block"
              onClick={() => {
                onChange(draft);
                setEditing(null);
              }}
            >
              Pronto
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

interface RunState {
  phase: 'work' | 'rest';
  /** Quando a fase atual termina (ms). */
  endsAt: number;
  round: number;
  /** Segundos que faltavam quando pausou (null = correndo). */
  pausedLeft: number | null;
  cfg: IntervalConfig;
}

const keyOf = (itemId: string) => `mt.tiros.${itemId}`;
function readRun(itemId: string): RunState | null {
  try {
    const raw = localStorage.getItem(keyOf(itemId));
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}
function writeRun(itemId: string, st: RunState | null): void {
  try {
    if (st) localStorage.setItem(keyOf(itemId), JSON.stringify(st));
    else localStorage.removeItem(keyOf(itemId));
  } catch {
    // sem armazenamento: o timer só vive enquanto a tela estiver aberta
  }
}

/**
 * Timer automático dos tiros: conta o tiro e o descanso, apita a cada troca e registra cada tiro
 * terminado como série feita. Continua certo mesmo se você sair da tela e voltar.
 */
export function TirosRunner({ itemId, config, onFinished }: { itemId: string; config: IntervalConfig | undefined; onFinished?: (count: number) => void }) {
  const cfg = config ?? DEFAULT_INTERVAL;
  const [run, setRunState] = useState<RunState | null>(() => readRun(itemId));
  const now = useNow(250);
  const setRun = (st: RunState | null) => {
    writeRun(itemId, st);
    setRunState(st);
  };

  // Trocas de fase (inclusive as que passaram enquanto a tela estava fechada).
  useEffect(() => {
    // O estado gravado é a referência: se esta troca já foi feita (efeito repetido), não registra de novo.
    const saved = readRun(itemId);
    if (!run || !saved || saved.pausedLeft !== null || now < saved.endsAt) {
      if (saved && saved.endsAt !== run?.endsAt) setRunState(saved);
      return;
    }
    const st = { ...saved };
    let logged = 0;
    let finished = false;
    while (now >= st.endsAt) {
      if (st.phase === 'work') {
        logged += 1;
        if (st.round >= st.cfg.rounds) {
          finished = true;
          break;
        }
        if (st.cfg.rest > 0) {
          st.phase = 'rest';
          st.endsAt += st.cfg.rest * 1000;
        } else {
          st.round += 1;
          st.endsAt += st.cfg.work * 1000;
        }
      } else {
        st.phase = 'work';
        st.round += 1;
        st.endsAt += st.cfg.work * 1000;
      }
    }
    // Grava a nova fase antes de registrar os tiros.
    if (finished) setRun(null);
    else setRun(st);
    for (let i = 0; i < logged; i++) void logTiro(itemId, st.cfg.work);
    if (finished) {
      beep(3);
      onFinished?.(st.cfg.rounds);
    } else {
      beep(st.phase === 'work' ? 2 : 1);
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) {
    return (
      <button
        type="button"
        className="btn primary block"
        onClick={() => {
          unlockAudio();
          beep(2);
          setRun({ phase: 'work', endsAt: Date.now() + cfg.work * 1000, round: 1, pausedLeft: null, cfg });
        }}
      >
        <Icon name="play" size={16} /> Iniciar tiros
      </button>
    );
  }

  const total = run.phase === 'work' ? run.cfg.work : run.cfg.rest;
  const left = run.pausedLeft ?? Math.max(0, (run.endsAt - now) / 1000);
  const R = 64;
  const C = 2 * Math.PI * R;
  const frac = total > 0 ? left / total : 0;
  const working = run.phase === 'work';

  const skip = () => {
    const t = Date.now();
    if (working) {
      void logTiro(itemId, Math.max(1, run.cfg.work - left));
      if (run.round >= run.cfg.rounds) {
        beep(3);
        setRun(null);
        onFinished?.(run.cfg.rounds);
        return;
      }
      beep(1);
      setRun({ ...run, phase: 'rest', endsAt: t + run.cfg.rest * 1000, pausedLeft: null });
    } else {
      beep(2);
      setRun({ ...run, phase: 'work', round: run.round + 1, endsAt: t + run.cfg.work * 1000, pausedLeft: null });
    }
  };

  return (
    <div className={`tiros-panel ${working ? '' : 'rest'}`} role="timer" aria-live="off">
      <div className="tiros-phase">{working ? 'TIRO' : 'DESCANSO'}</div>
      <div className="tiros-ring">
        <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
          <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
          <circle cx="75" cy="75" r={R} fill="none" stroke={working ? 'var(--success)' : 'var(--accent)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
        </svg>
        <b className="tnum">{formatDuration(Math.ceil(left))}</b>
      </div>
      <div className="small muted">
        Rodada {run.round} de {run.cfg.rounds}
      </div>
      <div className="tiros-ctl">
        <button
          type="button"
          className="glass pill"
          onClick={() =>
            setRun(run.pausedLeft === null ? { ...run, pausedLeft: left } : { ...run, pausedLeft: null, endsAt: Date.now() + run.pausedLeft * 1000 })
          }
        >
          <Icon name={run.pausedLeft === null ? 'pause' : 'play'} size={16} /> {run.pausedLeft === null ? 'Pausar' : 'Seguir'}
        </button>
        <button type="button" className="glass pill" onClick={skip}>
          <Icon name="next" size={16} /> Pular
        </button>
        <button type="button" className="glass pill danger-text" onClick={() => setRun(null)}>
          <Icon name="x" size={16} /> Parar
        </button>
      </div>
    </div>
  );
}
