import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSlideNavigate } from '../lib/nav';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/Layout';
import { MuscleMultiPicker, MusclePicker } from '../components/Pickers';
import { db } from '../lib/db';
import { EQUIPMENT, UNITS } from '../lib/equipment';
import { compressImage } from '../lib/images';
import { muscleName } from '../lib/muscles';
import {
  addExercisesToSession,
  addExercisesToWorkout,
  deleteCustomExercise,
  getActiveSession,
  saveCustomExercise,
} from '../lib/repo';
import type { EquipmentId, LoadUnit, MuscleId } from '../lib/types';

export function NewExercise() {
  const { exerciseId } = useParams();
  const [params] = useSearchParams();
  const addToWorkout = params.get('treino');
  const addToSession = params.get('sessao') === '1';
  const go = useSlideNavigate();
  const { toast, confirm } = useDialogs();

  const existing = useLiveQuery(() => (exerciseId ? db.customExercises.get(exerciseId) : undefined), [exerciseId]);
  const workout = useLiveQuery(() => (addToWorkout ? db.workouts.get(addToWorkout) : undefined), [addToWorkout]);

  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<MuscleId | null>(null);
  const [secondary, setSecondary] = useState<MuscleId[]>([]);
  const [equipment, setEquipment] = useState<EquipmentId>('maquina');
  const [unit, setUnit] = useState<LoadUnit>('kg');
  const [videoUrl, setVideoUrl] = useState('');
  const [tips, setTips] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [addNow, setAddNow] = useState(true);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setPrimary(existing.primary);
    setSecondary(existing.secondary);
    setEquipment(existing.equipment);
    setUnit(existing.unit);
    setVideoUrl(existing.videoUrl ?? '');
    setTips(existing.tips ?? '');
    setPhotos(existing.photos ?? []);
  }, [existing]);

  const pickPhoto = async (slot: number, file: File | undefined) => {
    if (!file) return;
    try {
      const data = await compressImage(file);
      setPhotos((prev) => {
        const next = [...prev];
        next[slot] = data;
        return next.filter(Boolean);
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível usar essa foto');
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Dê um nome ao exercício.');
      return;
    }
    if (!primary) {
      setError('Escolha o músculo principal.');
      return;
    }
    setBusy(true);
    const id = await saveCustomExercise({
      id: existing?.id,
      name: name.trim(),
      primary,
      secondary: secondary.filter((m) => m !== primary),
      equipment,
      unit,
      photos,
      videoUrl: videoUrl.trim() || undefined,
      tips: tips.trim() || undefined,
    });
    if (!existing && addNow && addToWorkout) {
      await addExercisesToWorkout(addToWorkout, [id]);
      toast('Exercício criado e adicionado');
      go(`/treino/${addToWorkout}?editar=1&novo=1`, { dir: 'back', replace: true });
      return;
    }
    if (!existing && addNow && addToSession) {
      const s = await getActiveSession();
      if (s) await addExercisesToSession(s.id, [id]);
      go('/sessao', { dir: 'back', replace: true });
      return;
    }
    toast(existing ? 'Exercício salvo' : 'Exercício criado');
    go(`/exercicio/${id}`, { dir: existing ? 'back' : 'forward', replace: true });
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: 'Excluir este exercício?',
      message: 'Ele sai da biblioteca. Os treinos já feitos com ele continuam no histórico.',
      confirmLabel: 'Excluir exercício',
      danger: true,
    });
    if (!ok) return;
    await deleteCustomExercise(existing.id);
    go('/exercicios', { dir: 'back', replace: true });
  };

  const canAdd = !existing && (addToWorkout || addToSession);

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          <button type="button" className="glass pill accent-text" onClick={() => go(-1)}>
            Cancelar
          </button>
        }
        title={existing ? 'Editar exercício' : 'Novo exercício'}
        right={
          <button type="button" className="pill-primary" onClick={save} disabled={busy}>
            Salvar
          </button>
        }
      />

      <div className="field">
        <span className="label">Fotos da execução</span>
        <div className="grid-2">
          {['Início do movimento', 'Fim do movimento'].map((label, slot) => (
            <div key={label} style={{ position: 'relative' }}>
              <button
                type="button"
                className="photo-cell photo-add"
                style={{ aspectRatio: 'auto', height: 110, width: '100%' }}
                onClick={() => fileInputs[slot].current?.click()}
              >
                {photos[slot] ? (
                  <img src={photos[slot]} alt={label} style={{ position: 'absolute', inset: 0 }} />
                ) : (
                  <>
                    <Icon name="camera" size={24} />
                    {label}
                  </>
                )}
              </button>
              {photos[slot] && (
                <button
                  type="button"
                  className="icon-btn round"
                  style={{ position: 'absolute', top: 6, right: 6, width: 32, height: 32, minWidth: 32 }}
                  aria-label={`Remover foto: ${label}`}
                  onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== slot))}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
              <input
                ref={fileInputs[slot]}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void pickPhoto(slot, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">Nome</span>
        <input
          className="input"
          value={name}
          placeholder="Supino na máquina articulada"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </label>

      <div className="grid-2">
        <div className="field">
          <span className="label">Músculo principal</span>
          <button type="button" className="filter-btn" style={{ minHeight: 48 }} onClick={() => setPrimaryOpen(true)}>
            <span className="ellipsis" style={{ color: primary ? 'var(--text)' : 'var(--muted)' }}>
              {primary ? muscleName(primary) : 'Escolher'}
            </span>
            <Icon name="next" size={18} color="var(--text-2)" />
          </button>
        </div>
        <div className="field">
          <span className="label">Outros músculos</span>
          <button type="button" className="filter-btn" style={{ minHeight: 48 }} onClick={() => setSecondaryOpen(true)}>
            <span className="ellipsis" style={{ color: secondary.length ? 'var(--text)' : 'var(--muted)' }}>
              {secondary.length ? secondary.map((m) => muscleName(m).toLowerCase()).join(', ') : 'Opcional'}
            </span>
            <Icon name="next" size={18} color="var(--text-2)" />
          </button>
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="label">Equipamento</span>
          <select className="select" value={equipment} onChange={(e) => setEquipment(e.target.value as EquipmentId)}>
            {EQUIPMENT.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Vídeo (opcional)</span>
          <input className="input" type="url" value={videoUrl} placeholder="Link do YouTube" onChange={(e) => setVideoUrl(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span className="label">Como anotar a carga</span>
        <div className="seg">
          {UNITS.map((u) => (
            <button type="button" key={u.id} className={unit === u.id ? 'on' : ''} aria-pressed={unit === u.id} onClick={() => setUnit(u.id)}>
              {u.name}
            </button>
          ))}
        </div>
        <span className="tiny muted">Use “Nº da placa” para polias e máquinas que só mostram o número.</span>
      </div>

      <label className="field">
        <span className="label">Dicas de execução</span>
        <textarea className="textarea" value={tips} placeholder="Banco na posição 4, cotovelos levemente dobrados" onChange={(e) => setTips(e.target.value)} />
      </label>

      {canAdd && (
        <div className="notice" style={{ alignItems: 'center' }}>
          <div className="col grow">
            <span style={{ fontWeight: 700 }}>
              {addToWorkout ? `Adicionar ao treino ${workout?.letter ?? ''} agora` : 'Adicionar ao treino de agora'}
            </span>
            <span className="tiny muted">Ele também fica na sua biblioteca, junto com os exercícios padrão</span>
          </div>
          <button type="button" role="switch" aria-checked={addNow} aria-label="Adicionar ao treino agora" className="switch" onClick={() => setAddNow((v) => !v)}>
            <span />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      <button type="button" className="btn big primary block" onClick={save} disabled={busy}>
        {existing ? 'Salvar exercício' : 'Criar exercício'}
      </button>
      {existing && (
        <button type="button" className="btn block danger" onClick={remove}>
          <Icon name="trash" size={18} /> Excluir exercício
        </button>
      )}

      <MusclePicker open={primaryOpen} onClose={() => setPrimaryOpen(false)} value={primary} onSelect={(m) => setPrimary(m)} title="Músculo principal" />
      <MuscleMultiPicker open={secondaryOpen} onClose={() => setSecondaryOpen(false)} values={secondary} onChange={setSecondary} exclude={primary} />
    </main>
  );
}
