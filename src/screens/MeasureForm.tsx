import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/Layout';
import { db } from '../lib/db';
import { num, parseNum, todayISO } from '../lib/format';
import { compressImage } from '../lib/images';
import { MEASURES } from '../lib/measures';
import { deleteBodyEntry, saveBodyEntry } from '../lib/repo';

export function MeasureForm() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const fileRef = useRef<HTMLInputElement>(null);

  const data = useLiveQuery(async () => {
    const all = (await db.bodyEntries.filter((b) => !b.deleted).toArray()).sort((a, b) => (a.date < b.date ? 1 : -1));
    const entry = entryId ? all.find((e) => e.id === entryId) : undefined;
    return { all, entry };
  }, [entryId]);

  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!data || loaded) return;
    const e = data.entry;
    if (e) {
      setDate(e.date);
      setWeight(e.weight !== null ? num(e.weight, 2) : '');
      setFat(e.bodyFat !== null ? num(e.bodyFat, 2) : '');
      setValues(Object.fromEntries(Object.entries(e.measures ?? {}).map(([k, v]) => [k, num(v, 2)])));
      setPhoto(e.photo ?? null);
    }
    setLoaded(true);
  }, [data, loaded]);

  if (!data) return <main className="screen no-tabs" />;
  const all = data.all;

  // Valor anterior de cada campo (do registro mais recente antes desta data).
  const previous = (pick: (e: (typeof all)[number]) => number | null | undefined) => {
    const e = all.find((x) => x.id !== entryId && x.date <= date && pick(x) !== null && pick(x) !== undefined);
    return e ? pick(e) : null;
  };

  const save = async () => {
    const measures: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseNum(v);
      if (n !== null) measures[k] = n;
    }
    await saveBodyEntry({
      id: data.entry?.id,
      date,
      weight: parseNum(weight),
      bodyFat: parseNum(fat),
      measures,
      photo,
    });
    toast('Medidas salvas');
    navigate('/progresso/corpo', { replace: true });
  };

  const remove = async () => {
    if (!data.entry) return;
    const ok = await confirm({ title: 'Apagar este registro?', confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    await deleteBodyEntry(data.entry.id);
    navigate('/progresso/corpo', { replace: true });
  };

  const row = (label: string, id: string, value: string, onChange: (v: string) => void, prev: number | null | undefined, unit: string) => (
    <div key={id} className="list-item" style={{ minHeight: 58 }}>
      <label htmlFor={id} className="col grow" style={{ gap: 1 }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span className="tiny muted" style={{ fontWeight: 500 }}>
          {prev !== null && prev !== undefined ? `Antes: ${num(prev)} ${unit}` : 'Sem registro anterior'}
        </span>
      </label>
      <input
        id={id}
        className="set-input"
        style={{ width: 88, textAlign: 'right', padding: '0 10px' }}
        inputMode="decimal"
        value={value}
        placeholder="0,0"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="small muted" style={{ width: 24 }}>
        {unit}
      </span>
    </div>
  );

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          <button type="button" className="text-btn muted" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        }
        title={data.entry ? 'Editar medidas' : 'Registrar medidas'}
        right={
          <button type="button" className="text-btn" style={{ fontWeight: 800 }} onClick={save}>
            Salvar
          </button>
        }
      />

      <label className="field">
        <span className="label">Data</span>
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>

      <span className="label">Corpo</span>
      <div className="list-group">
        {row('Peso', 'm-peso', weight, setWeight, previous((e) => e.weight), 'kg')}
        {row('Gordura corporal', 'm-gordura', fat, setFat, previous((e) => e.bodyFat), '%')}
      </div>

      <span className="label">Medidas</span>
      <div className="list-group">
        {MEASURES.map((m) =>
          row(
            m.name,
            `m-${m.key}`,
            values[m.key] ?? '',
            (v) => setValues((cur) => ({ ...cur, [m.key]: v })),
            previous((e) => e.measures?.[m.key]),
            'cm',
          ),
        )}
      </div>

      <div className="field">
        <span className="label">Foto de progresso</span>
        {photo ? (
          <div style={{ position: 'relative' }}>
            <img src={photo} alt="Foto de progresso" style={{ width: '100%', borderRadius: 14 }} />
            <button type="button" className="btn small soft" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setPhoto(null)}>
              Remover
            </button>
          </div>
        ) : (
          <button type="button" className="btn big dashed block" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" /> Adicionar foto
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setPhoto(await compressImage(f, 1100, 0.75));
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Não foi possível usar essa foto');
            }
          }}
        />
      </div>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Preencha só o que quiser medir. Os campos vazios ficam de fora.
      </p>

      <button type="button" className="btn big primary block" onClick={save}>
        Salvar medidas
      </button>
      {data.entry && (
        <button type="button" className="btn block danger" onClick={remove}>
          <Icon name="trash" size={18} /> Apagar registro
        </button>
      )}
    </main>
  );
}
