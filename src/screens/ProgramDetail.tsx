import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, EmptyState, TopBar } from '../components/Layout';
import { db } from '../lib/db';
import { dayMonth, fullDate, toISODate } from '../lib/format';
import {
  activateProgram,
  archiveProgram,
  createWorkout,
  deleteProgram,
  duplicateProgram,
  renameProgram,
  workoutsOf,
} from '../lib/repo';

export function ProgramDetail() {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const { prompt, confirm, toast } = useDialogs();

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
        <EmptyState title="Ficha não encontrada" action={{ label: 'Ver fichas', to: '/treinos' }} />
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
    const name = await prompt({ title: 'Renomear ficha', label: 'Nome da ficha', initial: program.name });
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
      title: 'Ativar esta ficha?',
      message: 'A ficha ativa atual será encerrada. O histórico dela continua guardado.',
      confirmLabel: 'Ativar ficha',
    });
    if (!ok) return;
    await activateProgram(program.id);
    toast('Ficha ativada');
  };

  const archive = async () => {
    const ok = await confirm({
      title: 'Encerrar esta ficha?',
      message: 'Ela sai do Início, mas o histórico e os treinos continuam guardados. Você pode ativá-la de novo quando quiser.',
      confirmLabel: 'Encerrar ficha',
    });
    if (ok) await archiveProgram(program.id);
  };

  const duplicate = async () => {
    const id = await duplicateProgram(program.id);
    toast('Cópia criada');
    navigate(`/ficha/${id}`);
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir esta ficha?',
      message: 'Os treinos montados nela serão apagados. Os treinos que você já fez continuam no histórico.',
      confirmLabel: 'Excluir ficha',
      danger: true,
    });
    if (!ok) return;
    await deleteProgram(program.id);
    navigate('/treinos', { replace: true });
  };

  return (
    <main className="screen no-tabs">
      <TopBar left={<BackButton to="/treinos" label="Treinos" />} right={<button type="button" className="text-btn" onClick={rename}>Renomear</button>} />
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
          <EmptyState title="Nenhum treino nesta ficha" text="Crie o Treino A e escolha os exercícios." />
        )}
        {workouts.map((w) => (
          <Link key={w.id} to={`/treino/${w.id}`} className="list-row">
            <div className="letter">{w.letter}</div>
            <div className="col grow">
              <span style={{ fontWeight: 700 }}>{w.name}</span>
              <span className="tiny muted">
                {counts[w.id] ?? 0} {(counts[w.id] ?? 0) === 1 ? 'exercício' : 'exercícios'} · descanso {w.restSeconds} s
              </span>
            </div>
            <Icon name="next" size={20} color="var(--muted)" />
          </Link>
        ))}
        <button type="button" className="btn big dashed block" onClick={addWorkout}>
          <Icon name="plus" /> Adicionar treino
        </button>
      </section>

      <section className="list-group">
        {program.status !== 'active' && (
          <button type="button" className="list-item" onClick={activate}>
            <Icon name="check" color="var(--accent)" />
            <span className="grow">Ativar esta ficha</span>
          </button>
        )}
        <button type="button" className="list-item" onClick={duplicate}>
          <Icon name="copy" color="var(--text-2)" />
          <span className="grow">Duplicar ficha</span>
        </button>
        {program.status === 'active' && (
          <button type="button" className="list-item" onClick={archive}>
            <Icon name="archive" color="var(--text-2)" />
            <span className="grow">Encerrar ficha</span>
          </button>
        )}
        <button type="button" className="list-item danger" onClick={remove}>
          <Icon name="trash" />
          <span className="grow">Excluir ficha</span>
        </button>
      </section>
    </main>
  );
}
