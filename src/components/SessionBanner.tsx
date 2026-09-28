import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { clock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { getActiveSession } from '../lib/repo';
import { Icon } from './Icon';

/** Aviso fixo quando há um treino em andamento e você está em outra tela. */
export function SessionBanner() {
  const session = useLiveQuery(() => getActiveSession(), []);
  const now = useNow(1000);
  if (!session) return null;
  const elapsed = session.startedAt ? (now - session.startedAt) / 1000 : 0;
  return (
    <Link to="/sessao" className="session-banner">
      <Icon name="timer" size={22} />
      <span className="col grow">
        <span className="tiny" style={{ fontWeight: 700 }}>
          Treino em andamento
        </span>
        <span className="ellipsis">{session.title}</span>
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(elapsed)}</span>
      <Icon name="next" size={20} />
    </Link>
  );
}
