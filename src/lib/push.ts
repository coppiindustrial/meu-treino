import { getClient, getCloudConfig } from './supabase';

/**
 * Avisos de fim do descanso (notificação na tela do iPhone, mesmo com o app fechado).
 * O app se inscreve nos avisos e, a cada descanso, marca no Supabase a hora do fim; a função
 * "avisos" do Supabase (supabase/functions/avisos) manda a notificação quando a hora chega.
 */

export type PushStatus = 'unsupported' | 'install' | 'cloud' | 'denied' | 'off' | 'on';

const LS_ON = 'mt.push';
const LS_JOB = 'mt.push.job';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // sem armazenamento
  }
};

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

async function session() {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ? client : null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!(await session())) return 'cloud';
  if (Notification.permission === 'denied') return 'denied';
  if (read(LS_ON) === '1' && Notification.permission === 'granted' && (await currentSubscription())) return 'on';
  return 'off';
}

/** Chave pública "base64url" → bytes (formato que o navegador pede para se inscrever). */
function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Liga os avisos. Precisa ser chamado direto do toque no botão (o iPhone só pede permissão assim). */
export async function enableRestPush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  const client = await session();
  const cfg = getCloudConfig();
  if (!client || !cfg) return 'cloud';

  let publicKey: string;
  try {
    const res = await fetch(`${cfg.url}/functions/v1/avisos`);
    publicKey = ((await res.json()) as { publicKey?: string }).publicKey ?? '';
  } catch {
    publicKey = '';
  }
  if (!publicKey) throw new Error('O servidor de avisos ainda não foi configurado no Supabase.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await client
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }, { onConflict: 'endpoint' });
  if (error) throw new Error('Não foi possível salvar este aparelho na nuvem.');
  write(LS_ON, '1');
  return 'on';
}

export async function disableRestPush(): Promise<void> {
  write(LS_ON, null);
  cancelRestPush();
  const sub = await currentSubscription();
  if (!sub) return;
  const client = await session();
  await client?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// As marcações vão para a nuvem uma de cada vez, na ordem (começar e pular logo em seguida não se atropelam).
let chain: Promise<unknown> = Promise.resolve();
function queue(task: () => Promise<unknown>): void {
  chain = chain.then(task).catch(() => undefined);
}

const pushOn = () => read(LS_ON) === '1';

async function insertJob(sendAt: number, title: string, body: string): Promise<string | null> {
  const client = await session();
  if (!client) return null;
  const id = crypto.randomUUID();
  const { error } = await client.from('push_jobs').insert({ id, send_at: new Date(sendAt).toISOString(), title, body });
  return error ? null : id;
}

async function deleteJob(): Promise<void> {
  const id = read(LS_JOB);
  if (!id) return;
  write(LS_JOB, null);
  const client = await session();
  await client?.from('push_jobs').delete().eq('id', id);
}

/** Marca o aviso para o fim do descanso (substitui o anterior). */
export function scheduleRestPush(endsAt: number, body: string): void {
  if (!pushOn()) return;
  queue(async () => {
    await deleteJob();
    const id = await insertJob(endsAt, 'Descanso acabou', body);
    if (id) write(LS_JOB, id);
  });
}

/** O descanso ganhou ou perdeu tempo: muda a hora do aviso. */
export function moveRestPush(endsAt: number): void {
  if (!pushOn()) return;
  queue(async () => {
    const id = read(LS_JOB);
    const client = await session();
    if (id && client) await client.from('push_jobs').update({ send_at: new Date(endsAt).toISOString() }).eq('id', id);
  });
}

/** Descanso pulado ou encerrado com o app aberto: o aviso não precisa mais sair. */
export function cancelRestPush(): void {
  if (!read(LS_JOB)) return;
  queue(deleteJob);
}

/** Manda um aviso de teste daqui a alguns segundos (dá tempo de bloquear a tela). */
export async function testRestPush(): Promise<boolean> {
  return (await insertJob(Date.now() + 6000, 'Teste de aviso', 'Os avisos de fim do descanso estão funcionando.')) !== null;
}
