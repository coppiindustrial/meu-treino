import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useNow } from '../lib/hooks';
import { deleteSession, getActiveSession } from '../lib/repo';
import { useDialogs } from './Dialogs';
import { useRest } from './RestTimer';
import { withTransition } from '../lib/nav';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Início', icon: 'home' },
  { to: '/treinos', label: 'Treinos', icon: 'dumbbell' },
  { to: '/calendario', label: 'Calendário', icon: 'calendar' },
  { to: '/progresso', label: 'Progresso', icon: 'chart' },
  { to: '/perfil', label: 'Perfil', icon: 'user' },
];

function isTabActive(t: (typeof TABS)[number], pathname: string): boolean {
  if (t.to === '/') return pathname === '/';
  return pathname.startsWith(t.to);
}

// Bolha "elástica": a borda da frente sai primeiro e a de trás alcança depois.
const LEAD = 'cubic-bezier(.25,1.35,.5,1)';
const TRAIL = 'cubic-bezier(.3,1.2,.5,1)';

export function TabBar({ pathname }: { pathname: string }) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => isTabActive(t, pathname)),
  );
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // A bolha anda no toque (antes da tela nova carregar); a rota confirma depois.
  const [pos, setPos] = useState({ index: activeIndex, from: activeIndex });
  const [lens, setLens] = useState(false);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPos((p) => (p.index === activeIndex ? p : { index: activeIndex, from: p.index }));
  }, [activeIndex]);

  // Se o toque não virou troca de aba (arrastou o dedo para fora), a bolha volta.
  useEffect(() => {
    if (pos.index === activeRef.current) return;
    const t = setTimeout(() => {
      if (activeRef.current !== pos.index) setPos((p) => ({ index: activeRef.current, from: p.index }));
    }, 700);
    return () => clearTimeout(t);
  }, [pos.index]);

  const moveTo = (k: number) => setPos((p) => (p.index === k ? p : { index: k, from: p.index }));

  const slot = (width - 10) / 5;
  const left = 5 + pos.index * slot;
  const right = width - (5 + (pos.index + 1) * slot);
  const toRight = pos.index > pos.from;
  const bubbleStyle: CSSProperties = {
    left,
    right,
    opacity: width ? 1 : 0,
    transition:
      pos.index === pos.from || !width
        ? 'none'
        : toRight
          ? `right .3s ${LEAD}, left .5s ${TRAIL} .07s`
          : `left .3s ${LEAD}, right .5s ${TRAIL} .07s`,
  };

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        <SessionStrip />
        <div className="tabs-row" ref={innerRef}>
        <span className={`tab-highlight ${lens ? 'lens' : ''}`} aria-hidden="true" style={bubbleStyle}>
          <i />
        </span>
        {TABS.map((t, k) => {
          const on = isTabActive(t, pathname);
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={`tab ${pos.index === k ? 'on' : ''}`}
              aria-current={on ? 'page' : undefined}
              onPointerDown={() => (k === pos.index ? setLens(true) : moveTo(k))}
              onPointerUp={() => setLens(false)}
              onPointerLeave={() => setLens(false)}
              onPointerCancel={() => setLens(false)}
            >
              <Icon name={t.icon} size={22} stroke={1.9} />
              <span>{t.label}</span>
            </NavLink>
          );
        })}
        </div>
      </div>
    </nav>
  );
}

function elapsedText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Treino em andamento na parte de cima do menu de vidro (como o mini player do Música). */
function SessionStrip() {
  const session = useLiveQuery(() => getActiveSession(), []);
  const now = useNow(1000);
  const { confirm, toast } = useDialogs();
  const rest = useRest();
  if (!session) return null;
  const elapsed = session.startedAt ? (now - session.startedAt) / 1000 : 0;
  const discard = async () => {
    const ok = await confirm({
      title: 'Descartar este treino?',
      message: 'Tudo que foi marcado nele será apagado e ele não entra no calendário.',
      confirmLabel: 'Descartar treino',
      danger: true,
    });
    if (!ok) return;
    await deleteSession(session.id);
    rest.stop();
    toast('Treino descartado');
  };
  return (
    <div className="session-strip">
      <Link to="/sessao" className="session-strip-main" aria-label={`Abrir o treino em andamento: ${session.title}`}>
        <span className="live-dot" aria-hidden="true" />
        <span className="ellipsis grow">{session.title}</span>
        <span className="session-strip-time">{elapsedText(elapsed)}</span>
      </Link>
      <button type="button" className="glass circle danger-text" aria-label="Descartar treino" onClick={discard}>
        <Icon name="x" size={19} stroke={2.4} />
      </button>
      <Link to="/sessao" className="glass circle" aria-label="Abrir o treino">
        <Icon name="up" size={22} stroke={2.4} />
      </Link>
    </div>
  );
}

export function isTabRoute(pathname: string): boolean {
  return ['/', '/treinos', '/calendario', '/progresso', '/progresso/corpo', '/perfil'].includes(pathname);
}

/** Botão redondo de vidro para voltar: volta no histórico ou vai para um endereço padrão. */
export function BackButton({ to }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="glass circle"
      aria-label="Voltar"
      onClick={() => {
        withTransition('back', () => {
          if (window.history.state && window.history.state.idx > 0) navigate(-1);
          else navigate(to ?? '/');
        });
      }}
    >
      <Icon name="arrowLeft" size={22} />
    </button>
  );
}

export function TopBar({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="topbar">
      <div>{left}</div>
      {title ? <div className="topbar-title">{title}</div> : <div />}
      <div>{right}</div>
    </div>
  );
}

/** Cabeçalho das abas: título à esquerda e botões de vidro à direita. */
export function TabHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="tab-head">
      <h1 className="h1">{title}</h1>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="empty">
      <span className="title">{title}</span>
      {text && <span className="small" style={{ lineHeight: 1.5 }}>{text}</span>}
      {action &&
        (action.to ? (
          <Link className="btn primary" to={action.to}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn primary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
