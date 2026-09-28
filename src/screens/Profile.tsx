import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { exportBackup, importBackup } from '../lib/backup';
import { num, parseNum } from '../lib/format';
import { getProfile, saveProfile } from '../lib/repo';
import { useSyncState } from '../lib/sync';

export function Profile() {
  const profile = useLiveQuery(() => getProfile(), []);
  const sync = useSyncState();
  const { prompt, toast, confirm } = useDialogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [installOpen, setInstallOpen] = useState(false);

  if (!profile) return <main className="screen" />;

  const edit = async (field: 'name' | 'goal' | 'heightCm' | 'weeklyGoal' | 'restSeconds') => {
    const config = {
      name: { title: 'Seu nome', value: profile.name, mode: 'text' as const },
      goal: { title: 'Objetivo', value: profile.goal, mode: 'text' as const },
      heightCm: { title: 'Altura (cm)', value: profile.heightCm ? String(profile.heightCm) : '', mode: 'numeric' as const },
      weeklyGoal: { title: 'Meta de treinos por semana', value: String(profile.weeklyGoal), mode: 'numeric' as const },
      restSeconds: { title: 'Descanso padrão (segundos)', value: String(profile.restSeconds), mode: 'numeric' as const },
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

  const doExport = async () => {
    try {
      await exportBackup();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast('Não foi possível gerar o backup');
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    const ok = await confirm({
      title: 'Importar este backup?',
      message: 'Os dados do arquivo serão juntados aos atuais. Quando o mesmo item existir nos dois, fica a versão mais recente.',
      confirmLabel: 'Importar',
    });
    if (!ok) return;
    try {
      const count = await importBackup(file);
      toast(`${count} itens importados`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Arquivo inválido');
    }
  };

  const syncText =
    sync.status === 'off'
      ? 'Não conectado. Seus dados estão só neste aparelho.'
      : sync.status === 'signedout'
        ? 'Nuvem configurada. Entre na sua conta para sincronizar.'
        : sync.status === 'syncing'
          ? 'Sincronizando…'
          : sync.status === 'error'
            ? `Erro ao sincronizar: ${sync.error ?? 'tente de novo'}`
            : sync.lastSync
              ? `Última vez ${new Date(sync.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
              : 'Conectado.';
  const syncTitle =
    sync.status === 'idle' ? 'Tudo sincronizado' : sync.status === 'syncing' ? 'Sincronizando' : sync.status === 'error' ? 'Problema na sincronização' : 'Backup na nuvem';

  return (
    <main className="screen">
      <h1 className="h1">Perfil</h1>

      <div className="row">
        <div className="icon-btn round" style={{ width: 64, height: 64, minWidth: 64, color: 'var(--text-2)' }} aria-hidden="true">
          <Icon name="user" size={30} />
        </div>
        <div className="col">
          <span style={{ fontSize: 20, fontWeight: 800 }}>{profile.name || 'Seu nome'}</span>
          <button type="button" className="text-btn" style={{ minHeight: 32, padding: 0, textAlign: 'left' }} onClick={() => edit('name')}>
            Editar nome
          </button>
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

      <Link to="/perfil/nuvem" className="notice" style={{ color: 'var(--text)' }}>
        <span className="notice-icon">
          <Icon name={sync.status === 'idle' ? 'cloudCheck' : 'cloud'} />
        </span>
        <div className="col grow">
          <span style={{ fontWeight: 800 }}>{syncTitle}</span>
          <span className="small muted" style={{ lineHeight: 1.45 }}>
            {syncText}
          </span>
        </div>
        <Icon name="next" size={18} color="var(--muted)" />
      </Link>

      <div className="list-group">
        <button type="button" className="list-item" onClick={() => edit('restSeconds')}>
          <Icon name="timer" color="var(--text-2)" />
          <span className="grow">Descanso padrão</span>
          <span className="value">{profile.restSeconds} s</span>
        </button>
        <Link to="/exercicios" className="list-item">
          <Icon name="book" color="var(--text-2)" />
          <span className="grow">Biblioteca de exercícios</span>
          <Icon name="next" size={18} color="var(--muted)" />
        </Link>
        <button type="button" className="list-item" onClick={doExport}>
          <Icon name="download" color="var(--text-2)" />
          <span className="grow">Exportar backup (arquivo)</span>
        </button>
        <button type="button" className="list-item" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" color="var(--text-2)" />
          <span className="grow">Importar backup</span>
        </button>
        <button type="button" className="list-item" onClick={() => setInstallOpen(true)}>
          <Icon name="info" color="var(--text-2)" />
          <span className="grow">Instalar no iPhone</span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void doImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <p className="tiny muted" style={{ textAlign: 'center', lineHeight: 1.5 }}>
        Meu Treino · versão {__APP_VERSION__}
        <br />
        Animações: ExerciseDB. Fotos: free-exercise-db (domínio público).
      </p>

      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="Instalar no iPhone">
        <ol className="steps">
          <li>
            <span className="n">1</span>
            <span>Abra este app no Safari (não funciona pelo Chrome no iPhone).</span>
          </li>
          <li>
            <span className="n">2</span>
            <span>Toque no botão Compartilhar (o quadrado com a seta para cima).</span>
          </li>
          <li>
            <span className="n">3</span>
            <span>Escolha “Adicionar à Tela de Início” e toque em Adicionar.</span>
          </li>
          <li>
            <span className="n">4</span>
            <span>Abra sempre pelo ícone novo: ele funciona em tela cheia e sem internet.</span>
          </li>
        </ol>
      </Sheet>
    </main>
  );
}
