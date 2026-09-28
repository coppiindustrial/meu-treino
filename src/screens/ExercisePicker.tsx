import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { EquipmentPicker, MusclePicker } from '../components/Pickers';
import { db } from '../lib/db';
import { equipmentName } from '../lib/equipment';
import { normalize, useExercises } from '../lib/exercises';
import { muscleName } from '../lib/muscles';
import { addExercisesToSession, addExercisesToWorkout, getActiveSession } from '../lib/repo';
import type { EquipmentId, MuscleId } from '../lib/types';

type Mode = 'browse' | 'workout' | 'session';

export function ExercisePicker({ mode }: { mode: Mode }) {
  const { workoutId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const { list } = useExercises();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [equipment, setEquipment] = useState<EquipmentId | null>(null);
  const [muscleOpen, setMuscleOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const workout = useLiveQuery(() => (workoutId ? db.workouts.get(workoutId) : undefined), [workoutId]);
  const usage = useLiveQuery(async () => {
    const items = await db.sessionItems.filter((i) => !i.deleted).toArray();
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.exerciseId] = (counts[it.exerciseId] ?? 0) + 1;
    return counts;
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const out = list.filter((e) => {
      if (muscle && e.primary !== muscle && !e.secondary.includes(muscle)) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (q && !normalize(e.name).includes(q)) return false;
      return true;
    });
    if (muscle) {
      // Primeiro os que têm o músculo como principal
      out.sort((a, b) => Number(b.primary === muscle) - Number(a.primary === muscle));
    }
    return out;
  }, [list, query, muscle, equipment]);

  const recent = useMemo(() => {
    if (!usage || query || muscle || equipment || mode === 'browse') return [];
    return list
      .filter((e) => (usage[e.id] ?? 0) > 0)
      .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0))
      .slice(0, 6);
  }, [usage, list, query, muscle, equipment, mode]);

  const adding = mode !== 'browse';
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const confirmAdd = async () => {
    if (selected.length === 0) return;
    if (mode === 'workout') {
      await addExercisesToWorkout(workoutId, selected);
      toast(selected.length === 1 ? 'Exercício adicionado' : `${selected.length} exercícios adicionados`);
      navigate(`/treino/${workoutId}`, { replace: true });
    } else {
      const s = await getActiveSession();
      if (s) await addExercisesToSession(s.id, selected);
      navigate('/sessao', { replace: true });
    }
  };

  const createLink =
    mode === 'workout' ? `/exercicios/novo?treino=${workoutId}` : mode === 'session' ? '/exercicios/novo?sessao=1' : '/exercicios/novo';

  const row = (e: (typeof list)[number]) => {
    const on = selected.includes(e.id);
    const sub = `${muscleName(e.primary)} · ${equipmentName(e.equipment)}`;
    if (!adding) {
      return (
        <Link key={e.id} to={`/exercicio/${e.id}`} className="list-row" style={{ padding: 10 }}>
          <ExerciseThumb exercise={e} size="lg" />
          <div className="col grow">
            <div className="row" style={{ gap: 6 }}>
              <span style={{ fontWeight: 700 }}>{e.name}</span>
              {e.custom && <span className="chip soft-accent">Seu</span>}
            </div>
            <span className="small muted">{sub}</span>
          </div>
          <Icon name="next" size={20} color="var(--muted)" />
        </Link>
      );
    }
    return (
      <div key={e.id} className="list-row" style={{ padding: 10, borderColor: on ? 'var(--accent)' : 'transparent' }}>
        <Link to={`/exercicio/${e.id}`} aria-label={`Ver ${e.name}`}>
          <ExerciseThumb exercise={e} size="lg" />
        </Link>
        <button
          type="button"
          className="col grow"
          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--text)' }}
          onClick={() => toggle(e.id)}
        >
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{e.name}</span>
            {e.custom && <span className="chip soft-accent">Seu</span>}
          </div>
          <span className="small" style={{ color: on ? 'var(--accent)' : 'var(--text-2)', fontWeight: on ? 700 : 400 }}>
            {on ? 'Selecionado' : sub}
          </span>
        </button>
        <button
          type="button"
          className={`check-circle ${on ? 'on' : ''}`}
          aria-pressed={on}
          aria-label={on ? `Tirar ${e.name}` : `Selecionar ${e.name}`}
          onClick={() => toggle(e.id)}
        >
          {on ? <Icon name="check" size={20} stroke={3} /> : <Icon name="plus" size={20} color="var(--text)" />}
        </button>
      </div>
    );
  };

  return (
    <main className="screen no-tabs tight">
      <TopBar
        left={
          <BackButton
            to={mode === 'workout' ? `/treino/${workoutId}` : mode === 'session' ? '/sessao' : '/treinos'}
            label={mode === 'workout' ? `Treino ${workout?.letter ?? ''}` : mode === 'session' ? 'Treino' : 'Voltar'}
          />
        }
        right={
          <Link to={createLink} className="text-btn" style={{ display: 'flex', alignItems: 'center' }}>
            Criar
          </Link>
        }
      />
      <h1 className="h1" style={{ fontSize: 32 }}>
        {adding ? 'Adicionar exercício' : 'Exercícios'}
      </h1>

      <label className="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="Buscar exercício"
          aria-label="Buscar exercício"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-btn ghost" style={{ width: 32, minWidth: 32, height: 32 }} aria-label="Limpar busca" onClick={() => setQuery('')}>
            <Icon name="x" size={18} />
          </button>
        )}
      </label>

      <div className="grid-2" style={{ gap: 8 }}>
        <button type="button" className={`filter-btn ${equipment ? 'on' : ''}`} onClick={() => setEquipOpen(true)}>
          <span className="ellipsis">{equipment ? equipmentName(equipment) : 'Equipamento'}</span>
          <Icon name="down" size={18} />
        </button>
        <button type="button" className={`filter-btn ${muscle ? 'on' : ''}`} onClick={() => setMuscleOpen(true)}>
          <span className="ellipsis">{muscle ? muscleName(muscle) : 'Músculo'}</span>
          <Icon name="down" size={18} />
        </button>
      </div>

      {recent.length > 0 && (
        <section className="stack">
          <span className="label">Mais usados</span>
          {recent.map(row)}
          <span className="label" style={{ marginTop: 6 }}>
            Todos
          </span>
        </section>
      )}

      <section className="stack">
        {filtered.length === 0 && (
          <div className="empty">
            <span className="title">Nada encontrado</span>
            <span className="small">Não achou? Crie o seu com foto ou link do YouTube.</span>
            <Link to={createLink} className="btn primary">
              Criar exercício
            </Link>
          </div>
        )}
        {filtered.map(row)}
      </section>

      {filtered.length > 0 && (
        <div className="notice">
          <div className="col grow">
            <span style={{ fontWeight: 700 }}>Não achou o exercício?</span>
            <span className="small muted">Crie o seu com foto da galeria ou link do YouTube.</span>
          </div>
          <Link to={createLink} className="btn small soft">
            Criar
          </Link>
        </div>
      )}

      {adding && selected.length > 0 && (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            <button type="button" className="btn big primary grow" onClick={confirmAdd}>
              Adicionar {selected.length} {selected.length === 1 ? 'exercício' : 'exercícios'}
            </button>
          </div>
        </div>
      )}

      <MusclePicker open={muscleOpen} onClose={() => setMuscleOpen(false)} value={muscle} onSelect={setMuscle} allowAll />
      <EquipmentPicker open={equipOpen} onClose={() => setEquipOpen(false)} value={equipment} onSelect={setEquipment} allowAll />
    </main>
  );
}
