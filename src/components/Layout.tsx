import type { CSSProperties, ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName; also?: string[] }[] = [
  { to: '/', label: 'Início', icon: 'home' },
  { to: '/treinos', label: 'Treinos', icon: 'dumbbell' },
  { to: '/calendario', label: 'Calendário', icon: 'calendar', also: ['/historico'] },
  { to: '/progresso', label: 'Progresso', icon: 'chart' },
  { to: '/perfil', label: 'Perfil', icon: 'user' },
];

function isTabActive(t: (typeof TABS)[number], pathname: string): boolean {
  if (t.to === '/') return pathname === '/';
  return pathname.startsWith(t.to) || (t.also ?? []).some((a) => pathname.startsWith(a));
}

export function TabBar({ pathname }: { pathname: string }) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => isTabActive(t, pathname)),
  );
  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        <span className="tab-highlight" aria-hidden="true" style={{ '--i': activeIndex } as CSSProperties} />
        {TABS.map((t) => {
          const on = isTabActive(t, pathname);
          return (
            <NavLink key={t.to} to={t.to} className={`tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon name={t.icon} size={22} stroke={1.9} />
              <span>{t.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function isTabRoute(pathname: string): boolean {
  return ['/', '/treinos', '/calendario', '/historico', '/progresso', '/progresso/corpo', '/perfil'].includes(pathname);
}

/** Botão de voltar: volta no histórico ou vai para um endereço padrão. */
export function BackButton({ to, label = 'Voltar' }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="back"
      onClick={() => {
        if (window.history.state && window.history.state.idx > 0) navigate(-1);
        else navigate(to ?? '/');
      }}
    >
      <Icon name="back" />
      {label}
    </button>
  );
}

export function TopBar({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="topbar">
      <div style={{ minWidth: 72, display: 'flex' }}>{left}</div>
      {title ? <div className="topbar-title">{title}</div> : <div className="grow" />}
      <div style={{ minWidth: 72, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
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
