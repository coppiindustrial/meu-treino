import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkline } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { LoadingScreen } from '../components/Layout';
import { db } from '../lib/db';
import { dayMonth, fullDate, num } from '../lib/format';
import { MEASURES } from '../lib/measures';
import type { BodyEntry } from '../lib/types';
import { ProgressHead } from './Progress';

function signed(n: number): string {
  if (Math.abs(n) < 0.05) return 'igual';
  return `${n > 0 ? '+' : '−'}${num(Math.abs(n))}`;
}

export function Body() {
  const entries = useLiveQuery(
    async () => (await db.bodyEntries.filter((b) => !b.deleted).toArray()).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [],
  );
  const [photo, setPhoto] = useState<BodyEntry | null>(null);

  if (!entries) return <LoadingScreen tabs />;

  const weights = entries.filter((e) => e.weight !== null).reverse();
  const latestWeight = weights[weights.length - 1];
  const firstWeight = weights[0];

  const measureRows = MEASURES.map((m) => {
    const withValue = entries.filter((e) => e.measures?.[m.key] !== undefined);
    if (withValue.length === 0) return null;
    const current = withValue[0].measures[m.key];
    const previous = withValue[1]?.measures[m.key];
    return { ...m, current, diff: previous !== undefined ? current - previous : null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const lastMeasureDate = entries.find((e) => Object.keys(e.measures ?? {}).length > 0)?.date;
  const photos = entries.filter((e) => e.photo).slice(0, 7);

  return (
    <main className="screen tight fade-in">
      <ProgressHead active="corpo" />
      <div className="seg-content">

      <div className="card flat row between">
        <div className="col" style={{ gap: 2 }}>
          <span className="small muted">Peso</span>
          <span className="display" style={{ fontSize: 40 }}>
            {latestWeight ? `${num(latestWeight.weight)} kg` : '—'}
          </span>
          <span className="small muted">
            {latestWeight && firstWeight && firstWeight !== latestWeight
              ? `${signed((latestWeight.weight ?? 0) - (firstWeight.weight ?? 0))} kg desde ${dayMonth(firstWeight.date)}`
              : latestWeight
                ? `Registrado em ${dayMonth(latestWeight.date)}`
                : 'Registre seu peso para acompanhar'}
          </span>
        </div>
        <Sparkline values={weights.slice(-12).map((w) => w.weight as number)} width={120} height={56} />
      </div>

      <section className="stack">
        <div className="section-head">
          <h2 className="h2">Medidas</h2>
          {lastMeasureDate && <span className="small muted">Última: {dayMonth(lastMeasureDate)}</span>}
        </div>
        {measureRows.length === 0 ? (
          <div className="empty" style={{ padding: 18 }}>
            <span className="small">Nenhuma medida ainda. Toque no + lá em cima para registrar.</span>
          </div>
        ) : (
          <div className="grid-2" style={{ gap: 8 }}>
            {measureRows.map((m) => (
              <div key={m.key} className="tile">
                <span className="tiny muted">{m.name}</span>
                <div className="row between" style={{ alignItems: 'baseline' }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{num(m.current)} cm</span>
                  {m.diff !== null && <span className="tiny muted" style={{ fontWeight: 700 }}>{signed(m.diff)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <div className="section-head">
          <h2 className="h2">Fotos</h2>
          <span className="small muted">Só você vê</span>
        </div>
        <div className="photo-grid">
          {photos.map((e) => (
            <button type="button" key={e.id} className="photo-cell" aria-label={`Foto de ${fullDate(e.date)}`} onClick={() => setPhoto(e)}>
              <img src={e.photo!} alt="" />
              <span className="date">{dayMonth(e.date)}</span>
            </button>
          ))}
          <Link to="/progresso/medidas/nova" className="photo-cell photo-add">
            <Icon name="camera" size={22} />
            Adicionar
          </Link>
        </div>
      </section>


      {entries.length > 0 && (
        <section className="stack">
          <h2 className="h2">Registros</h2>
          <div className="list-group">
            {entries.map((e) => {
              const count = Object.keys(e.measures ?? {}).length;
              return (
                <Link key={e.id} to={`/progresso/medidas/${e.id}`} className="list-item">
                  <span className="small muted" style={{ width: 84 }}>
                    {fullDate(e.date)}
                  </span>
                  <span className="grow" style={{ fontSize: 14 }}>
                    {[e.weight !== null ? `${num(e.weight)} kg` : null, count ? `${count} ${count === 1 ? 'medida' : 'medidas'}` : null, e.photo ? 'foto' : null]
                      .filter(Boolean)
                      .join(' · ') || 'Sem dados'}
                  </span>
                  <Icon name="next" size={18} color="var(--muted)" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      </div>

      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={photo ? fullDate(photo.date) : undefined}>
        {photo?.photo && <img src={photo.photo} alt={`Foto de progresso de ${fullDate(photo.date)}`} style={{ width: '100%', borderRadius: 14 }} />}
      </Sheet>
    </main>
  );
}
