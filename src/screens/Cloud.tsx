import { useState } from 'react';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, TopBar } from '../components/Layout';
import { getClient, getCloudConfig, isCloudFromEnv, saveCloudConfig } from '../lib/supabase';
import { initSync, syncNow, useSyncState } from '../lib/sync';

export function Cloud() {
  const sync = useSyncState();
  const { toast, confirm } = useDialogs();
  const [cfg, setCfg] = useState(getCloudConfig());
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveConfig = async () => {
    const u = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/.+\.supabase\.co$/.test(u)) {
      setError('O endereço deve ser parecido com https://abcdefgh.supabase.co');
      return;
    }
    if (key.trim().length < 30) {
      setError('Cole a chave pública completa.');
      return;
    }
    if (/^sb_secret_/.test(key.trim()) || key.includes('service_role')) {
      setError('Essa é a chave secreta. Use a chave pública (publishable ou anon).');
      return;
    }
    saveCloudConfig({ url: u, anonKey: key.trim() });
    setCfg(getCloudConfig());
    setError(null);
    await initSync();
    toast('Nuvem configurada');
  };

  const auth = async (mode: 'login' | 'signup') => {
    const sb = getClient();
    if (!sb) return;
    if (!email.trim() || password.length < 6) {
      setError('Informe o e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } =
      mode === 'login'
        ? await sb.auth.signInWithPassword({ email: email.trim(), password })
        : await sb.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos.'
          : err.message.includes('Email not confirmed')
            ? 'Confirme seu e-mail pelo link que o Supabase enviou e tente de novo.'
            : err.message,
      );
      return;
    }
    if (mode === 'signup' && !data.session) {
      toast('Conta criada. Confirme pelo e-mail e depois entre.');
      return;
    }
    setPassword('');
    toast('Conectado');
    await initSync();
    void syncNow();
  };

  const signOut = async () => {
    const ok = await confirm({
      title: 'Sair da conta?',
      message: 'Seus dados continuam neste aparelho. Eles só param de sincronizar.',
      confirmLabel: 'Sair',
    });
    if (!ok) return;
    await getClient()?.auth.signOut();
    await initSync();
  };

  const removeConfig = async () => {
    const ok = await confirm({ title: 'Desconectar da nuvem?', message: 'Seus dados continuam neste aparelho.', confirmLabel: 'Desconectar', danger: true });
    if (!ok) return;
    await getClient()?.auth.signOut();
    saveCloudConfig(null);
    setCfg(null);
    await initSync();
  };

  return (
    <main className="screen no-tabs">
      <TopBar left={<BackButton to="/perfil" label="Perfil" />} title="Nuvem" />

      {!cfg ? (
        <>
          <div className="notice">
            <span className="notice-icon">
              <Icon name="cloud" />
            </span>
            <span className="small" style={{ lineHeight: 1.5 }}>
              Conectando ao Supabase, seus dados ficam guardados na nuvem e aparecem em qualquer aparelho. O app continua funcionando sem internet.
            </span>
          </div>
          <label className="field">
            <span className="label">Project URL</span>
            <input className="input" value={url} placeholder="https://abcdefgh.supabase.co" autoCapitalize="off" autoCorrect="off" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Chave pública</span>
            <textarea className="textarea" value={key} placeholder="sb_publishable_… ou eyJhbGciOi…" autoCapitalize="off" autoCorrect="off" onChange={(e) => setKey(e.target.value)} />
          </label>
          <span className="tiny muted" style={{ lineHeight: 1.5 }}>
            No painel do Supabase, em Project Settings → API Keys. Use a chave pública (“publishable” ou “anon public”). Nunca use a chave secreta (“secret” ou “service_role”).
          </span>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}
          <button type="button" className="btn big primary block" onClick={saveConfig}>
            Conectar
          </button>
        </>
      ) : sync.status === 'signedout' || (sync.status === 'off' && cfg) ? (
        <>
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, marginTop: 20 }}>
            <div className="letter big on" style={{ width: 72, height: 72, borderRadius: 20 }}>
              <Icon name="dumbbell" size={38} stroke={2.25} />
            </div>
            <h1 className="display" style={{ fontSize: 40 }}>
              Meu Treino
            </h1>
            <p className="muted">Entre para sincronizar seus treinos.</p>
          </div>
          <label className="field">
            <span className="label">E-mail</span>
            <input className="input" type="email" autoComplete="email" value={email} placeholder="voce@email.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Senha</span>
            <input className="input" type="password" autoComplete="current-password" value={password} placeholder="Sua senha" onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}
          <button type="button" className="btn big primary block" disabled={busy} onClick={() => auth('login')}>
            Entrar
          </button>
          <button type="button" className="btn block" disabled={busy} onClick={() => auth('signup')}>
            Criar conta
          </button>
          {!isCloudFromEnv() && (
            <button type="button" className="text-btn muted" onClick={removeConfig}>
              Trocar projeto do Supabase
            </button>
          )}
        </>
      ) : (
        <>
          <div className="notice">
            <span className="notice-icon">
              <Icon name={sync.status === 'error' ? 'cloud' : 'cloudCheck'} />
            </span>
            <div className="col">
              <span style={{ fontWeight: 800 }}>
                {sync.status === 'syncing' ? 'Sincronizando…' : sync.status === 'error' ? 'Problema na sincronização' : 'Tudo sincronizado'}
              </span>
              <span className="small muted">{sync.email}</span>
              {sync.lastSync && (
                <span className="tiny muted">
                  Última vez: {new Date(sync.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {sync.status === 'error' && <span className="tiny" style={{ color: 'var(--danger)' }}>{sync.error}</span>}
            </div>
          </div>
          <button type="button" className="btn big block" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
            <Icon name="refresh" /> Sincronizar agora
          </button>
          <span className="tiny muted" style={{ lineHeight: 1.5 }}>
            O app sincroniza sozinho ao abrir, ao voltar para ele e alguns segundos depois de cada alteração.
          </span>
          <div className="list-group">
            <button type="button" className="list-item danger" onClick={signOut}>
              <Icon name="logout" />
              <span className="grow">Sair da conta</span>
            </button>
          </div>
        </>
      )}
    </main>
  );
}
