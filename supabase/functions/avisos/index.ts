// Meu Treino: avisos de fim do descanso (notificações Web Push).
// Publicar no Supabase como Edge Function "avisos", com "Enforce JWT verification" desligado.
//   GET  -> devolve a chave pública (o app usa para se inscrever nos avisos).
//   POST -> manda os avisos cuja hora chegou (chamado pelo agendador do banco a cada 5 s).
// As chaves de envio são criadas na primeira vez e ficam na tabela push_config (só o servidor lê).
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import postgres from 'npm:postgres@3.4.5';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface Ready {
  server: webpush.ApplicationServer;
  publicKey: string;
}

let ready: Promise<Ready> | null = null;

async function load(): Promise<Ready> {
  let [row] = await sql`select vapid from public.push_config where id = 1`;
  if (!row) {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    const exported = await webpush.exportVapidKeys(keys);
    await sql`insert into public.push_config (id, vapid) values (1, ${sql.json(exported as unknown as postgres.JSONValue)}) on conflict (id) do nothing`;
    [row] = await sql`select vapid from public.push_config where id = 1`;
  }
  // A chave pode ter sido gravada como texto em vez de objeto: aceita os dois.
  const stored = typeof row.vapid === 'string' ? JSON.parse(row.vapid) : row.vapid;
  const vapidKeys = await webpush.importVapidKeys(stored, { extractable: false });
  return {
    publicKey: await webpush.exportApplicationServerKey(vapidKeys),
    server: await webpush.ApplicationServer.new({
      contactInformation: 'https://coppiindustrial.github.io/meu-treino/',
      vapidKeys,
    }),
  };
}

function getReady(): Promise<Ready> {
  if (!ready) {
    ready = load().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Pega os avisos que chegaram na hora (apagando-os, para não sair duas vezes) e manda para os aparelhos. */
async function sendDue(): Promise<number> {
  const { server } = await getReady();
  const jobs = await sql`
    delete from public.push_jobs
    where send_at <= now() + interval '1 second'
    returning user_id, title, body`;
  let sent = 0;
  for (const job of jobs) {
    const subs = await sql`select endpoint, p256dh, auth from public.push_subscriptions where user_id = ${job.user_id}`;
    for (const s of subs) {
      try {
        await server
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(JSON.stringify({ title: job.title, body: job.body }), { ttl: 120, urgency: webpush.Urgency.High });
        sent++;
      } catch (e) {
        // Aparelho que desativou os avisos (ou reinstalou o app): tira da lista.
        if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404)) {
          await sql`delete from public.push_subscriptions where endpoint = ${s.endpoint}`;
        } else {
          console.error('aviso não enviado', String(e));
        }
      }
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method === 'GET') {
      const { publicKey } = await getReady();
      return Response.json({ publicKey }, { headers: CORS });
    }
    return Response.json({ sent: await sendDue() }, { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500, headers: CORS });
  }
});
