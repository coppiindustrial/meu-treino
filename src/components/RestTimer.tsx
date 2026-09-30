import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { mmss } from '../lib/format';
import { beep, unlockAudio } from '../lib/sound';
import { Icon } from './Icon';

interface RestState {
  endsAt: number | null;
  total: number;
}

interface RestApi extends RestState {
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

const Ctx = createContext<RestApi | null>(null);
const LS_KEY = 'mt.rest';

export function useRest(): RestApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('RestTimerProvider ausente');
  return ctx;
}

function readState(): RestState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as RestState;
      if (s.endsAt && s.endsAt > Date.now()) return s;
    }
  } catch {
    // sem armazenamento
  }
  return { endsAt: null, total: 0 };
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RestState>(readState);

  const persist = (s: RestState) => {
    setState(s);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch {
      // sem armazenamento
    }
  };

  const start = useCallback((seconds: number) => {
    unlockAudio();
    persist({ endsAt: Date.now() + seconds * 1000, total: seconds });
  }, []);

  const add = useCallback((seconds: number) => {
    setState((s) => {
      if (!s.endsAt) return s;
      const next = { endsAt: s.endsAt + seconds * 1000, total: Math.max(1, s.total + seconds) };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // sem armazenamento
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => persist({ endsAt: null, total: 0 }), []);

  return (
    <Ctx.Provider value={{ ...state, start, add, stop }}>
      {children}
      <RestBar />
    </Ctx.Provider>
  );
}

function RestBar() {
  const rest = useRest();
  const [now, setNow] = useState(Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const alerted = useRef<number | null>(null);

  useEffect(() => {
    if (!rest.endsAt && !finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest.endsAt, finishedAt]);

  useEffect(() => {
    if (rest.endsAt && now >= rest.endsAt && alerted.current !== rest.endsAt) {
      alerted.current = rest.endsAt;
      beep();
      setFinishedAt(Date.now());
      rest.stop();
    }
  }, [now, rest]);

  useEffect(() => {
    if (!finishedAt) return;
    const id = setTimeout(() => setFinishedAt(null), 4000);
    return () => clearTimeout(id);
  }, [finishedAt]);

  if (rest.endsAt) {
    const left = (rest.endsAt - now) / 1000;
    const frac = rest.total > 0 ? Math.min(1, Math.max(0, left / rest.total)) : 0;
    return (
      <div className="rest-bar" role="timer" aria-live="off">
        <span className="rest-progress" aria-hidden="true" style={{ transform: `scaleX(${frac})` }} />
        <Icon name="timer" size={22} />
        <div className="col grow">
          <span className="tiny muted">Descanso</span>
          <span className="rest-time">{mmss(left)}</span>
        </div>
        <button type="button" className="btn small soft" onClick={() => rest.add(-15)} aria-label="Menos 15 segundos">
          −15
        </button>
        <button type="button" className="btn small soft" onClick={() => rest.add(15)} aria-label="Mais 15 segundos">
          +15
        </button>
        <button type="button" className="btn small primary" onClick={rest.stop}>
          Pular
        </button>
      </div>
    );
  }
  if (finishedAt) {
    return (
      <div className="rest-bar done" role="status">
        <Icon name="check" size={22} stroke={3} />
        <span className="grow" style={{ fontWeight: 800 }}>
          Descanso acabou. Próxima série!
        </span>
        <button type="button" className="btn small light" onClick={() => setFinishedAt(null)}>
          Ok
        </button>
      </div>
    );
  }
  return null;
}
