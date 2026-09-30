import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { dayMonth, num, parseNum } from '../lib/format';
import { getProfile, saveProfile } from '../lib/repo';
import { doneSessions } from '../lib/stats';

/** Perfil: o que é seu (nome, medidas, meta, histórico e biblioteca). Os ajustes do app ficam em Configurações. */
export function Profile() {
  const profile = useLiveQuery(() => getProfile(), []);
  const sessions = useLiveQuery(() => doneSessions(), []);
  const { prompt } = useDialogs();

  if (!profile) return <main className="screen" />;

  const edit = async (field: 'name' | 'goal' | 'heightCm' | 'weeklyGoal') => {
    const config = {
      name: { title: 'Seu nome', value: profile.name, mode: 'text' as const },
      goal: { title: 'Objetivo', value: profile.goal, mode: 'text' as const },
      heightCm: { title: 'Altura (cm)', value: profile.heightCm ? String(profile.heightCm) : '', mode: 'numeric' as const },
      weeklyGoal: { title: 'Meta de treinos por semana', value: String(profile.weeklyGoal), mode: 'numeric' as const },
    }[field];
    const v = await prompt({ title: config.title, initial: config.value, inputMode: config.mode });
    if (v === null) return;
    if (field === 'name' || field === 'goal') await saveProfile({ [field]: v.trim() });
    else {
      const n = parseNum(v);
      if (field === 'heightCm') await saveProfile({ heightCm: n });
      else if (n !== null && n > 0) await saveProfile({ [field]: Math.round(n) });
    }
  };

  const count = sessions?.length ?? 0;
  // doneSessions vem do mais novo para o mais antigo: o último é o primeiro treino.
  const since = sessions && sessions.length > 0 ? sessions[sessions.length - 1].date : null;

  return (
    <main className="screen">
      <header className="tab-head">
        <h1 className="h1">Perfil</h1>
        <Link to="/perfil/configuracoes" className="glass circle" aria-label="Configurações">
          <Icon name="gear" size={21} />
        </Link>
      </header>

      <div className="row">
        <div className="icon-btn round" style={{ width: 64, height: 64, minWidth: 64, color: 'var(--text-2)' }} aria-hidden="true">
          <Icon name="user" size={30} />
        </div>
        <div className="col">
          <span style={{ fontSize: 20, fontWeight: 800 }}>{profile.name || 'Seu nome'}</span>
          <button type="button" className="text-btn" style={{ minHeight: 28, padding: 0, textAlign: 'left' }} onClick={() => edit('name')}>
            Editar nome
          </button>
          <span className="tiny muted">
            {count === 0 ? 'Nenhum treino ainda' : `${count} ${count === 1 ? 'treino' : 'treinos'}${since ? ` desde ${dayMonth(since)}` : ''}`}
          </span>
        </div>
      </div>

      <div className="grid-3">
        <button type="button" className="tile" style={{ border: 0, textAlign: 'left', color: 'var(--text)' }} onClick={() => edit('heightCm')}>
          <span className="tiny muted">Altura</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{profile.heightCm ? `${num(profile.heightCm / 100, 2)} m` : '—'}</span>
        </button>
        <button type="button" className="tile" style={{ border: 0, textAlign: 'left', color: 'var(--text)' }} onClick={() => edit('goal')}>
          <span className="tiny muted">Objetivo</span>
          <span className="ellipsis" style={{ fontSize: 17, fontWeight: 800 }}>
            {profile.goal || '—'}
          </span>
        </button>
        <button type="button" className="tile" style={{ border: 0, textAlign: 'left', color: 'var(--text)' }} onClick={() => edit('weeklyGoal')}>
          <span className="tiny muted">Meta semanal</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{profile.weeklyGoal} treinos</span>
        </button>
      </div>

      <div className="list-group">
        <Link to="/historico" className="list-item">
          <Icon name="clock" color="var(--text-2)" />
          <span className="grow">Histórico de treinos</span>
          {count > 0 && <span className="value">{count}</span>}
          <Icon name="next" size={18} color="var(--muted)" />
        </Link>
        <Link to="/exercicios" className="list-item">
          <Icon name="book" color="var(--text-2)" />
          <span className="grow">Biblioteca de exercícios</span>
          <Icon name="next" size={18} color="var(--muted)" />
        </Link>
      </div>
    </main>
  );
}
