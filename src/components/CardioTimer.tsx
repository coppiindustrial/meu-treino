import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { formatDuration } from '../lib/cardio';
import { db } from '../lib/db';
import { cancelCardioPush, scheduleCardioPush } from '../lib/push';
import { beep, unlockAudio } from '../lib/sound';
import { Icon } from './Icon';

/**
 * Cronômetro do cardio (bicicleta, esteira...): conta o tempo de uma série, avisa ao chegar na meta
 * e continua contando até concluir. Conta pela hora de início, então segue certo com a tela travada.
 */
interface CardioState {
  itemId: string;
  setIndex: number;
  /** Nome do exercício (barra e aviso). */
  label: string;
  /** Início do trecho atual contando; null = pausado. */
  startedAt: number | null;
  /** Tempo já contado antes do trecho atual (ms). */
  accumulated: number;
  targetSecs: number | null;
  /** O aviso da meta já tocou. */
  alerted: boolean;
}

interface CardioApi {
  state: CardioState | null;
  start: (itemId: string, setIndex: number, label: string, targetSecs: number | null) => void;
  pause: () => void;
  resume: () => void;
  /** Para e devolve o tempo contado (s), para gravar na série. */
  finish: () => { itemId: string; setIndex: number; secs: number } | null;
  cancel: () => void;
  /** Uma série foi apagada: cancela se era a do cronômetro, ou corrige o número dela. */
  setRemoved: (itemId: string, index: number) => void;
}

const Ctx = createContext<CardioApi | null>(null);
const LS_KEY = 'mt.cardio';

export function useCardio(): CardioApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('CardioTimerProvider ausente');
  return ctx;
}

/** Tempo contado (ms) até `now`. */
export function cardioElapsed(s: CardioState, now: number): number {
  return s.accumulated + (s.startedAt !== null ? Math.max(0, now - s.startedAt) : 0);
}

function readState(): CardioState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as CardioState;
  } catch {
    // sem armazenamento
  }
  return null;
}

function schedulePush(s: CardioState): void {
  if (s.startedAt === null || s.alerted || !s.targetSecs) return;
  const sendAt = s.startedAt + s.targetSecs * 1000 - s.accumulated;
  if (sendAt > Date.now()) scheduleCardioPush(sendAt, `${s.label}: ${formatDuration(s.targetSecs)} atingido.`);
}

export function CardioTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CardioState | null>(readState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback((s: CardioState | null) => {
    stateRef.current = s;
    setState(s);
    try {
      if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
      else localStorage.removeItem(LS_KEY);
    } catch {
      // sem armazenamento
    }
  }, []);

  const start = useCallback(
    (itemId: string, setIndex: number, label: string, targetSecs: number | null) => {
      unlockAudio();
      const s: CardioState = { itemId, setIndex, label, startedAt: Date.now(), accumulated: 0, targetSecs, alerted: false };
      persist(s);
      cancelCardioPush();
      schedulePush(s);
    },
    [persist],
  );

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.startedAt === null) return;
    persist({ ...s, accumulated: cardioElapsed(s, Date.now()), startedAt: null });
    cancelCardioPush();
  }, [persist]);

  const resume = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.startedAt !== null) return;
    unlockAudio();
    const next = { ...s, startedAt: Date.now() };
    persist(next);
    schedulePush(next);
  }, [persist]);

  const finish = useCallback(() => {
    const s = stateRef.current;
    if (!s) return null;
    persist(null);
    cancelCardioPush();
    return { itemId: s.itemId, setIndex: s.setIndex, secs: Math.max(1, Math.round(cardioElapsed(s, Date.now()) / 1000)) };
  }, [persist]);

  const cancel = useCallback(() => {
    if (!stateRef.current) return;
    persist(null);
    cancelCardioPush();
  }, [persist]);

  const setRemoved = useCallback(
    (itemId: string, index: number) => {
      const s = stateRef.current;
      if (!s || s.itemId !== itemId) return;
      if (index === s.setIndex) cancel();
      else if (index < s.setIndex) persist({ ...s, setIndex: s.setIndex - 1 });
    },
    [cancel, persist],
  );

  // Cronômetro "órfão": o exercício ou o treino dele não existe mais, ou o treino já foi concluído/descartado
  // (por qualquer caminho: faixa do treino, Calendário, outro aparelho). Aí ele some sozinho.
  const itemId = state?.itemId ?? null;
  const alive = useLiveQuery(async () => {
    if (!itemId) return null;
    const item = await db.sessionItems.get(itemId);
    if (!item || item.deleted) return false;
    const session = await db.sessions.get(item.sessionId);
    return !!session && !session.deleted && session.status === 'active';
  }, [itemId]);
  useEffect(() => {
    if (alive === false) cancel();
  }, [alive, cancel]);

  // Aviso da meta com o app aberto: apita e vibra uma vez. Com o app fechado, quem avisa é a notificação.
  useEffect(() => {
    if (!state || state.startedAt === null || state.alerted || !state.targetSecs) return;
    const check = () => {
      const s = stateRef.current;
      if (!s || s.startedAt === null || s.alerted || !s.targetSecs) return;
      const over = cardioElapsed(s, Date.now()) - s.targetSecs * 1000;
      if (over < 0) return;
      if (over < 3000) beep();
      persist({ ...s, alerted: true });
      cancelCardioPush();
    };
    check();
    const id = setInterval(check, 250);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [state, persist]);

  return (
    <Ctx.Provider value={{ state, start, pause, resume, finish, cancel, setRemoved }}>
      {children}
      <CardioBar />
    </Ctx.Provider>
  );
}

/** Hook de relógio para o cronômetro: atualiza 4× por segundo enquanto conta. */
export function useCardioNow(running: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

/** Barra fixa embaixo (como a do descanso): o tempo do cardio à vista de qualquer tela. */
function CardioBar() {
  const { state, pause, resume } = useCardio();
  const now = useCardioNow(!!state && state.startedAt !== null);
  if (!state) return null;
  const secs = cardioElapsed(state, now) / 1000;
  const running = state.startedAt !== null;
  const frac = state.targetSecs ? Math.min(1, secs / state.targetSecs) : 0;
  return (
    <div className={`rest-bar cardio-bar ${state.alerted ? 'reached' : ''}`} role="timer" aria-live="off">
      {state.targetSecs ? <span className="rest-progress" aria-hidden="true" style={{ transform: `scaleX(${frac})` }} /> : null}
      <Link to="/sessao" className="row grow" style={{ gap: 10, minWidth: 0, color: 'inherit' }} aria-label={`Abrir o treino: ${state.label}`}>
        <Icon name="clock" size={22} />
        <span className="col" style={{ minWidth: 0 }}>
          <span className="tiny muted ellipsis">
            {state.label}
            {state.alerted ? ' · meta atingida' : running ? '' : ' · pausado'}
          </span>
          <span className="rest-time">{formatDuration(Math.floor(secs)) || '0:00'}</span>
        </span>
      </Link>
      <button type="button" className="btn small soft" onClick={running ? pause : resume} aria-label={running ? 'Pausar o cronômetro' : 'Continuar o cronômetro'}>
        <Icon name={running ? 'pause' : 'play'} size={18} />
      </button>
    </div>
  );
}
