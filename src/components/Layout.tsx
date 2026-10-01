import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useNow } from '../lib/hooks';
import { deleteSession, getActiveSession } from '../lib/repo';
import { useDialogs } from './Dialogs';
import { useRest } from './RestTimer';
import { withTransition } from '../lib/nav';
import { Icon, type IconName } from './Icon';
import { LiquidTabs } from './liquidTabs';
import { tick } from '../lib/touch';
import { AppLogo } from './AppLogo';

// A aba Treinos usa o logo do app no lugar de um ícone de linha.
const TABS: { to: string; label: string; icon: IconName | 'logo' }[] = [
  { to: '/', label: 'Início', icon: 'home' },
  { to: '/treinos', label: 'Treinos', icon: 'logo' },
  { to: '/calendario', label: 'Calendário', icon: 'calendar' },
  { to: '/progresso', label: 'Progresso', icon: 'chart' },
  { to: '/perfil', label: 'Perfil', icon: 'user' },
];

function isTabActive(t: (typeof TABS)[number], pathname: string): boolean {
  if (t.to === '/') return pathname === '/';
  return pathname.startsWith(t.to);
}

export function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => isTabActive(t, pathname)),
  );
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const engine = useRef<LiquidTabs | null>(null);
  const drag = useRef<{ id: number; left: number; x0: number; x: number; moved: boolean; near: number } | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !pillRef.current || !lensRef.current) return;
    const eng = new LiquidTabs(row, pillRef.current, lensRef.current, () => tabRefs.current.filter((t): t is HTMLAnchorElement => !!t), TABS.length);
    engine.current = eng;
    eng.snap(activeRef.current);
    const ro = new ResizeObserver(() => {
      if (!drag.current) eng.snap(activeRef.current);
    });
    ro.observe(row);
    return () => {
      ro.disconnect();
      eng.destroy();
      engine.current = null;
    };
  }, []);

  // A aba mudou por outro caminho (link, voltar): a bolha vai até ela.
  useEffect(() => {
    if (!drag.current) engine.current?.settle(activeIndex);
  }, [activeIndex]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const eng = engine.current;
    if (!eng) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    drag.current = { id: e.pointerId, left: r.left, x0: x, x, moved: false, near: eng.nearest(x) };
    eng.press(x);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const eng = engine.current;
    if (!d || !eng || d.id !== e.pointerId) return;
    const x = e.clientX - d.left;
    d.x = x;
    if (Math.abs(x - d.x0) > 6) d.moved = true;
    eng.move(x);
    const n = eng.nearest(x);
    if (n !== d.near) {
      d.near = n;
      tick();
    }
  };

  // Soltar: assenta na aba onde o dedo saiu e troca de tela.
  const finish = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    const eng = engine.current;
    if (!d || !eng || d.id !== e.pointerId) return;
    drag.current = null;
    const target = commit ? eng.nearest(d.x) : activeRef.current;
    eng.release(target);
    if (target !== activeRef.current) withTransition('tab', () => navigate(TABS[target].to));
    // Se a tela não trocar, a bolha volta para a aba atual.
    setTimeout(() => {
      if (!drag.current && activeRef.current !== target) engine.current?.settle(activeRef.current);
    }, 800);
  };

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        <SessionStrip />
        <div
          className="tabs-row"
          ref={rowRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, true)}
          onPointerCancel={(e) => finish(e, false)}
        >
          <span className="tab-pill" ref={pillRef} aria-hidden="true" />
          {TABS.map((t, k) => (
            <NavLink
              key={t.to}
              ref={(el) => {
                tabRefs.current[k] = el;
              }}
              to={t.to}
              className={() => 'tab'}
              aria-current={isTabActive(t, pathname) ? 'page' : undefined}
              draggable={false}
            >
              {t.icon === 'logo' ? <AppLogo /> : <Icon name={t.icon} size={22} stroke={1.9} />}
              <span>{t.label}</span>
            </NavLink>
          ))}
          <span className="tab-lens" ref={lensRef} aria-hidden="true" />
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

/**
 * Tela enquanto os dados vêm do banco do celular. Nas telas internas já mostra o voltar (nunca fica
 * tudo preto); o data-loading avisa a troca de tela animada para esperar o conteúdo de verdade.
 */
export function LoadingScreen({ tabs = false, back }: { tabs?: boolean; back?: string }) {
  return (
    <main className={tabs ? 'screen' : 'screen no-tabs'} data-loading="">
      {!tabs && <TopBar left={<BackButton to={back} />} />}
    </main>
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
