import { useEffect, useState } from 'react';
import { disableRestPush, enableRestPush, pushStatus, testRestPush, type PushStatus } from '../lib/push';
import { useDialogs } from './Dialogs';
import { Icon } from './Icon';

const HINT: Partial<Record<PushStatus, string>> = {
  install: 'Abra o app pelo ícone da tela de início para ativar.',
  unsupported: 'Este aparelho não recebe avisos do app.',
  cloud: 'Entre no backup na nuvem (acima) para ativar.',
  denied: 'Bloqueado. Libere em Ajustes › Notificações › Meu Treino.',
};

/** Linha do Perfil: ligar os avisos de fim do descanso e mandar um aviso de teste. */
export function RestPushSetting() {
  const { toast } = useDialogs();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  const on = status === 'on';
  const hint = status ? HINT[status] : undefined;

  const toggle = async () => {
    if (!status || busy) return;
    if (hint) {
      toast(hint);
      return;
    }
    setBusy(true);
    try {
      if (on) {
        await disableRestPush();
        setStatus('off');
        toast('Avisos desligados');
      } else {
        const next = await enableRestPush();
        setStatus(next);
        if (next === 'on') toast('Avisos ligados');
        else if (HINT[next]) toast(HINT[next]!);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ligar os avisos');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const ok = await testRestPush();
    toast(ok ? 'Bloqueie a tela: o aviso chega em alguns segundos' : 'Não foi possível mandar o teste');
  };

  return (
    <>
      <button type="button" className="list-item" role="switch" aria-checked={on} aria-busy={busy} onClick={toggle}>
        <Icon name="bell" color="var(--text-2)" />
        <span className="grow col" style={{ gap: 2 }}>
          <span>Avisar quando o descanso acabar</span>
          {hint && <span className="tiny muted">{hint}</span>}
        </span>
        <span className="switch" aria-hidden="true" aria-checked={on}>
          <span />
        </span>
      </button>
      {on && (
        <button type="button" className="list-item" onClick={test}>
          <Icon name="bell" color="var(--text-2)" />
          <span className="grow">Mandar um aviso de teste</span>
        </button>
      )}
    </>
  );
}
