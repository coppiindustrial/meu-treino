import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { ReorderScreen } from '../components/ReorderScreen';
import { withTransition } from '../lib/nav';
import { deleteWorkout, reorderWorkouts, workoutsOf } from '../lib/repo';

/** Reordenar os treinos de uma rotina (as letras seguem a nova ordem; ⊖ exclui, com confirmação). */
export function ReorderProgram() {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const workouts = useLiveQuery(() => workoutsOf(programId), [programId]);

  const goBack = () =>
    withTransition('back', () => {
      if (window.history.state && window.history.state.idx > 0) navigate(-1);
      else navigate(`/ficha/${programId}`, { replace: true });
    });

  const done = async (order: string[]) => {
    if (!workouts) return;
    const same = order.length === workouts.length && order.every((id, i) => workouts[i].id === id);
    if (same) return goBack();
    const removed = workouts.filter((w) => !order.includes(w.id));
    if (removed.length > 0) {
      const ok = await confirm({
        title: removed.length === 1 ? `Excluir o treino "${removed[0].name}"?` : `Excluir ${removed.length} treinos?`,
        message: 'Os exercícios montados neles serão apagados. Os treinos que você já fez continuam no histórico.',
        confirmLabel: removed.length === 1 ? 'Excluir treino' : 'Excluir treinos',
        danger: true,
      });
      if (!ok) return;
      for (const w of removed) await deleteWorkout(w.id, false);
    }
    await reorderWorkouts(programId, order);
    toast(removed.length > 0 ? 'Rotina atualizada' : 'Ordem salva');
    goBack();
  };

  return (
    <ReorderScreen
      entries={workouts?.map((w) => ({ id: w.id, name: w.name }))}
      noun="treino"
      lead={(_, index) => <div className="letter">{String.fromCharCode(65 + index)}</div>}
      onCancel={goBack}
      onDone={(order) => void done(order)}
    />
  );
}
