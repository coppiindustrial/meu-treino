import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { ExerciseThumb } from '../components/Media';
import { ReorderScreen, type ReorderEntry } from '../components/ReorderScreen';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { withTransition } from '../lib/nav';
import { itemsOf, reorderWorkoutItems, restoreWorkout, snapshotWorkout } from '../lib/repo';

/** Reordenar os exercícios de um treino (arrastar pelo ≡, ⊖ tira). */
export function ReorderWorkout() {
  const { workoutId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const { map } = useExercises();
  const items = useLiveQuery(() => itemsOf(workoutId), [workoutId]);

  const goBack = () =>
    withTransition('back', () => {
      if (window.history.state && window.history.state.idx > 0) navigate(-1);
      else navigate(`/treino/${workoutId}`, { replace: true });
    });

  const inSuperset = new Set<string>();
  items?.forEach((it, i) => {
    if (it.supersetNext && items[i + 1]) {
      inSuperset.add(it.id);
      inSuperset.add(items[i + 1].id);
    }
  });
  const entries: ReorderEntry[] | undefined = items?.map((it) => ({ id: it.id, name: exerciseOrMissing(map, it.exerciseId).name, ss: inSuperset.has(it.id) }));

  const done = async (order: string[]) => {
    if (!items) return;
    const same = order.length === items.length && order.every((id, i) => items[i].id === id);
    if (same) return goBack();
    const removed = items.length - order.length;
    const snap = await snapshotWorkout(workoutId);
    await reorderWorkoutItems(workoutId, order);
    toast(removed > 0 ? `Ordem salva · ${removed} ${removed === 1 ? 'removido' : 'removidos'}` : 'Ordem salva', {
      action: {
        label: 'Desfazer',
        onClick: () => {
          if (snap) void restoreWorkout(snap);
        },
      },
    });
    goBack();
  };

  return (
    <ReorderScreen
      entries={entries}
      noun="exercício"
      lead={(entry) => {
        const it = items?.find((x) => x.id === entry.id);
        return (
          <span className="ex-avatar">
            <ExerciseThumb exercise={exerciseOrMissing(map, it?.exerciseId ?? '')} />
          </span>
        );
      }}
      onCancel={goBack}
      onDone={(order) => void done(order)}
    />
  );
}
