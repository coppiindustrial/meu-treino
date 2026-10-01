import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, LoadingScreen, TopBar } from '../components/Layout';
import { RestPushSetting } from '../components/RestPushSetting';
import { Sheet } from '../components/Sheet';
import { exportBackup, importBackup } from '../lib/backup';
import { parseNum } from '../lib/format';
import { getProfile, saveProfile } from '../lib/repo';
import { useSyncState, type SyncStatus } from '../lib/sync';
import { hapticsEnabled, setHapticsEnabled } from '../lib/touch';

const SYNC_VALUE: Record<SyncStatus, string> = {
  off: 'Desligado',
  signedout: 'Entrar',
  idle: 'Conectado',
  syncing: 'Sincronizando…',
  error: 'Com erro',
};

/** Tudo o que muda o jeito do app (aberto pela engrenagem do Perfil). */
export function Settings() {
  const profile = useLiveQuery(() => getProfile(), []);
  const sync = useSyncState();
  const { prompt, toast, confirm } = useDialogs();
  const [vibrate, setVibrate] = useState(hapticsEnabled);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!profile) return <LoadingScreen back="/perfil" />;

  const editRest = async () => {
    const v = await prompt({ title: 'Descanso padrão (segundos)', initial: String(profile.restSeconds), inputMode: 'numeric' });
    if (v === null) return;
    const n = parseNum(v);
    if (n !== null && n > 0) await saveProfile({ restSeconds: Math.round(n) });
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

  return (
    <main className="screen no-tabs">
      <TopBar left={<BackButton to="/perfil" />} title="Configurações" />

      <section className="stack">
        <span className="settings-label">Treino</span>
        <div className="list-group">
          <button type="button" className="list-item" onClick={editRest}>
            <Icon name="timer" color="var(--text-2)" />
            <span className="grow">Descanso padrão</span>
            <span className="value">{profile.restSeconds} s</span>
            <Icon name="next" size={18} color="var(--muted)" />
          </button>
          <RestPushSetting />
        </div>
      </section>

      <section className="stack">
        <span className="settings-label">Toque e desenhos</span>
        <div className="list-group">
          <button
            type="button"
            className="list-item"
            role="switch"
            aria-checked={vibrate}
            onClick={() => {
              const on = !vibrate;
              setHapticsEnabled(on);
              setVibrate(on);
            }}
          >
            <Icon name="vibrate" color="var(--text-2)" />
            <span className="grow">Vibrar ao tocar</span>
            <span className="switch" aria-hidden="true" aria-checked={vibrate}>
              <span />
            </span>
          </button>
          <button type="button" className="list-item" onClick={() => setBodyOpen(true)}>
            <Icon name="user" color="var(--text-2)" />
            <span className="grow">Corpo nos desenhos</span>
            <span className="value">{profile.body === 'female' ? 'Feminino' : 'Masculino'}</span>
            <Icon name="next" size={18} color="var(--muted)" />
          </button>
        </div>
      </section>

      <section className="stack">
        <span className="settings-label">Dados</span>
        <div className="list-group">
          <Link to="/perfil/nuvem" className="list-item">
            <Icon name={sync.status === 'idle' ? 'cloudCheck' : 'cloud'} color="var(--text-2)" />
            <span className="grow">Backup na nuvem</span>
            <span className="value" style={sync.status === 'error' ? { color: 'var(--danger)' } : undefined}>
              {SYNC_VALUE[sync.status]}
            </span>
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
        </div>
      </section>

      <section className="stack">
        <span className="settings-label">Ajuda</span>
        <div className="list-group">
          <button type="button" className="list-item" onClick={() => setInstallOpen(true)}>
            <Icon name="info" color="var(--text-2)" />
            <span className="grow">Instalar no iPhone</span>
            <Icon name="next" size={18} color="var(--muted)" />
          </button>
        </div>
      </section>

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
        <br />
        Desenhos do corpo: react-native-body-highlighter (licença MIT).
      </p>

      <Sheet open={bodyOpen} onClose={() => setBodyOpen(false)} title="Corpo nos desenhos" subtitle="Usado nos desenhos de músculos e de como medir">
        <div className="list-group">
          {([
            ['male', 'Masculino'],
            ['female', 'Feminino'],
          ] as const).map(([id, name]) => {
            const on = (profile.body ?? 'male') === id;
            return (
              <button
                key={id}
                type="button"
                className="list-item"
                style={{ minHeight: 56 }}
                aria-pressed={on}
                onClick={() => {
                  void saveProfile({ body: id });
                  setBodyOpen(false);
                }}
              >
                <span className="grow" style={{ fontSize: 16 }}>
                  {name}
                </span>
                {on && (
                  <span className="check-dot">
                    <Icon name="check" size={14} stroke={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>

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
