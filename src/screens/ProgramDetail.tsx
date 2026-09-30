import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ActionMenu } from '../components/ActionMenu';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { LongPressSort } from '../components/LongPressSort';
import { withTransition } from '../lib/nav';
import { db } from '../lib/db';
import { dayMonth, fullDate, toISODate } from '../lib/format';
import {
  activateProgram,
  archiveProgram,
  createWorkout,
  deleteProgram,
  duplicateProgram,
  renameProgram,
  reorderWorkouts,
  workoutsOf,
} from '../lib/repo';

export function ProgramDetail() {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const { prompt, confirm, toast } = useDialogs();
  const [menuOpen, setMenuOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const program = await db.programs.get(programId);
    const workouts = await workoutsOf(programId);
    const counts: Record<string, number> = {};
    for (const w of workouts) {
      counts[w.id] = await db.workoutItems.where('workoutId').equals(w.id).filter((i) => !i.deleted).count();
    }
    const sessions = await db.sessions.where('programId').equals(programId).filter((s) => !s.deleted && s.status === 'done').count();
    return { program, workouts, counts, sessions };
  }, [programId]);

  if (!data) return <main className="screen no-tabs" />;
  const { program, workouts, counts, sessions } = data;
  if (!program || program.deleted) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton to="/treinos" label="Treinos" />} />
        <EmptyState title="Rotina não encontrada" action={{ label: 'Ver rotinas', to: '/treinos' }} />
      </main>
    );
  }

  const statusText =
    program.status === 'active'
      ? `Ativa${program.startedAt ? ` desde ${dayMonth(toISODate(new Date(program.startedAt)))}` : ''}`
      : program.status === 'ready'
        ? 'Pronta para usar'
        : `Encerrada${program.endedAt ? ` em ${fullDate(toISODate(new Date(program.endedAt)))}` : ''}`;

  const rename = async () => {
    const name = await prompt({ title: 'Renomear rotina', label: 'Nome da rotina', initial: program.name });
    if (name !== null) await renameProgram(program.id, name);
  };

  const addWorkout = async () => {
    const name = await prompt({ title: 'Novo treino', label: 'Nome do treino', placeholder: 'Peito e tríceps' });
    if (name === null) return;
    const id = await createWorkout(program.id, name.trim() || 'Novo treino');
    navigate(`/treino/${id}`);
  };

  const activate = async () => {
    const ok = await confirm({
      title: 'Ativar esta rotina?',
      message: 'A rotina ativa atual será encerrada. O histórico dela continua guardado.',
      confirmLabel: 'Ativar rotina',
    });
    if (!ok) return;
    await activateProgram(program.id);
    toast('Rotina ativada');
  };

  const archive = async () => {
    const ok = await confirm({
      title: 'Encerrar esta rotina?',
      message: 'Ela sai do Início, mas o histórico e os treinos continuam guardados. Você pode ativá-la de novo quando quiser.',
      confirmLabel: 'Encerrar rotina',
    });
    if (ok) await archiveProgram(program.id);
  };

  const duplicate = async () => {
    const ok = await confirm({
      title: 'Duplicar esta rotina?',
      message: `Uma cópia de "${program.name}" será criada com todos os treinos, pronta para usar.`,
      confirmLabel: 'Duplicar',
    });
    if (!ok) return;
    const id = await duplicateProgram(program.id);
    toast('Cópia criada');
    navigate(`/ficha/${id}`);
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir esta rotina?',
      message: 'Os treinos montados nela serão apagados. Os treinos que você já fez continuam no histórico.',
      confirmLabel: 'Excluir rotina',
      danger: true,
    });
    if (!ok) return;
    await deleteProgram(program.id);
    navigate('/treinos', { replace: true });
  };

  return (
    <main className="screen no-tabs">
      <TopBar
        left={<BackButton to="/treinos" />}
        title="Rotina"
        right={
          <>
            <button type="button" className="glass circle" aria-label="Adicionar treino" onClick={addWorkout}>
              <Icon name="plus" size={22} stroke={2.4} />
            </button>
            <button type="button" className="glass circle" aria-label="Opções da rotina" onClick={() => setMenuOpen(true)}>
              <Icon name="more" size={22} />
            </button>
          </>
        }
      />
      <div className="col">
        <span className={`chip ${program.status === 'active' ? 'accent' : 'outline'}`}>{statusText}</span>
        <h1 className="h1" style={{ marginTop: 6 }}>
          {program.name}
        </h1>
        <span className="small muted">
          {workouts.length} {workouts.length === 1 ? 'treino' : 'treinos'} · {sessions} {sessions === 1 ? 'treino feito' : 'treinos feitos'}
        </span>
      </div>

      <section className="stack">
        {workouts.length === 0 && (
          <EmptyState title="Nenhum treino nesta rotina" text="Crie o Treino A e escolha os exercícios." />
        )}
        <LongPressSort ids={workouts.map((w) => w.id)} onReorder={(ids) => void reorderWorkouts(program.id, ids)}>
          {(id) => {
            const w = workouts.find((x) => x.id === id)!;
            return (
              <Link to={`/treino/${w.id}`} className="list-row" draggable={false}>
                <div className="letter">{w.letter}</div>
                <div className="col grow">
                  <span style={{ fontWeight: 700 }}>{w.name}</span>
                  <span className="tiny muted">
                    {counts[w.id] ?? 0} {(counts[w.id] ?? 0) === 1 ? 'exercício' : 'exercícios'} · descanso {w.restSeconds} s
                  </span>
                </div>
                <Icon name="next" size={20} color="var(--muted)" />
              </Link>
            );
          }}
        </LongPressSort>
      </section>

      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { icon: 'sort', label: 'Reordenar treinos', hidden: workouts.length < 2, onClick: () => withTransition('forward', () => navigate(`/ficha/${program.id}/reordenar`)) },
          { icon: 'check', label: 'Ativar esta rotina', hidden: program.status === 'active', onClick: activate },
          { icon: 'pencil', label: 'Renomear rotina', onClick: rename },
          { icon: 'copy', label: 'Duplicar rotina', onClick: duplicate },
          { icon: 'archive', label: 'Encerrar rotina', hidden: program.status !== 'active', onClick: archive },
          { icon: 'x', label: 'Excluir rotina', danger: true, onClick: remove },
        ]}
      />
    </main>
  );
}
