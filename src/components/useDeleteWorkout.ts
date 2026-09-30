import { deleteWorkout } from '../lib/repo';
import type { Workout } from '../lib/types';
import { useDialogs } from './Dialogs';

/** Excluir um treino da rotina, sempre com confirmação (ele leva junto os exercícios montados). */
export function useDeleteWorkout() {
  const { confirm, toast } = useDialogs();
  return async (w: Workout): Promise<boolean> => {
    const ok = await confirm({
      title: `Excluir o treino ${w.letter}?`,
      message: `"${w.name}" sai da rotina e os exercícios montados nele são apagados. Os treinos que você já fez continuam no histórico.`,
      confirmLabel: 'Excluir treino',
      danger: true,
    });
    if (!ok) return false;
    await deleteWorkout(w.id);
    toast('Treino excluído');
    return true;
  };
}
