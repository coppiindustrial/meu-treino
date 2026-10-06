import { useMemo, useState } from 'react';
import { useSlideNavigate } from '../lib/nav';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { Sheet } from '../components/Sheet';
import { getMeta, setMeta } from '../lib/db';
import { normalize, useExercises, type ExerciseView } from '../lib/exercises';
import {
  aliasKey,
  matchExercise,
  parseWorkoutText,
  plannedFromLine,
  rankExercises,
  type MatchStatus,
  type ParsedLine,
} from '../lib/importText';
import { importProgram } from '../lib/repo';
import { repsText } from '../lib/workout';

interface Row {
  key: string;
  line: ParsedLine;
  status: MatchStatus | 'ok';
  exerciseId: string | null;
  candidates: string[];
  removed: boolean;
}

interface Day {
  key: string;
  name: string;
  rows: Row[];
}

const ALIASES = 'importAliases';

const PLACEHOLDER = `Dia 1: Peito e tríceps
1. Supino reto com halteres: 3 x 6-10
2. Crucifixo no cabo: 3 x 10-15

Dia 2: Costas e bíceps
1. Puxada frontal: 3 x 8-10
…`;

export function ImportProgram() {
  const go = useSlideNavigate();
  const { toast } = useDialogs();
  const { list, map, ready } = useExercises();
  const [text, setText] = useState('');
  const [programName, setProgramName] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [editing, setEditing] = useState<{ day: number; row: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const read = async () => {
    const parsed = parseWorkoutText(text);
    if (parsed.length === 0) {
      toast('Não achei exercícios no texto. Confira se cada linha tem o nome e as séries (ex.: 3 x 10).');
      return;
    }
    const aliases = await getMeta<Record<string, string>>(ALIASES, {});
    setDays(
      parsed.map((d, di) => ({
        key: `d${di}`,
        name: d.name,
        rows: d.lines.map((line, li) => {
          const m = matchExercise(line.name, list, aliases);
          return {
            key: `d${di}-${li}`,
            line,
            status: m.status === 'found' ? 'ok' : m.status,
            exerciseId: m.exerciseId,
            candidates: m.candidates,
            removed: false,
          };
        }),
      })),
    );
    window.scrollTo(0, 0);
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) setText(clip);
    } catch {
      toast('Toque na caixa de texto e escolha "Colar".');
    }
  };

  const updateRow = (d: number, r: number, changes: Partial<Row>) => {
    setDays((prev) =>
      prev ? prev.map((day, di) => (di !== d ? day : { ...day, rows: day.rows.map((row, ri) => (ri === r ? { ...row, ...changes } : row)) })) : prev,
    );
  };

  // Guarda a escolha: da próxima vez, esse mesmo texto já entra certo.
  const choose = async (d: number, r: number, exerciseId: string) => {
    const row = days?.[d]?.rows[r];
    if (!row) return;
    updateRow(d, r, { exerciseId, status: 'ok', removed: false });
    const aliases = await getMeta<Record<string, string>>(ALIASES, {});
    aliases[aliasKey(row.line.name)] = exerciseId;
    await setMeta(ALIASES, aliases);
  };

  const rows = days?.flatMap((d) => d.rows.filter((r) => !r.removed)) ?? [];
  const counts = {
    ok: rows.filter((r) => r.status === 'ok').length,
    check: rows.filter((r) => r.status === 'check').length,
    missing: rows.filter((r) => r.status === 'missing').length,
  };

  const create = async () => {
    if (!days) return;
    if (counts.missing > 0) {
      document.querySelector('.import-row.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(
        counts.missing === 1
          ? 'Falta escolher 1 exercício: toque em "Procurar" ou tire da lista.'
          : `Faltam ${counts.missing} exercícios: toque em "Procurar" ou tire da lista.`,
      );
      return;
    }
    setSaving(true);
    const id = await importProgram(
      programName.trim() || 'Rotina colada',
      days
        .map((d) => ({
          name: d.name,
          items: d.rows
            .filter((r) => !r.removed && r.exerciseId)
            .map((r) => ({ exerciseId: r.exerciseId!, sets: plannedFromLine(r.line), repMode: r.line.repMode, note: r.line.note })),
        }))
        .filter((d) => d.items.length > 0),
    );
    toast('Rotina criada');
    go(`/ficha/${id}`, { replace: true });
  };

  const editingRow = editing && days ? days[editing.day]?.rows[editing.row] : undefined;

  if (!days) {
    return (
      <main className="screen no-tabs">
        <TopBar left={<BackButton to="/treinos" label="Treinos" />} />
        <div className="col">
          <h1 className="h1">Colar treino</h1>
          <span className="small muted" style={{ lineHeight: 1.5 }}>
            Cole o treino em texto. Cada dia vira um treino (A, B, C…) e os exercícios são procurados na biblioteca.
          </span>
        </div>
        <label className="field">
          <span className="label">Nome da rotina</span>
          <input className="input" value={programName} placeholder="Hipertrofia · outubro" onChange={(e) => setProgramName(e.target.value)} />
        </label>
        <label className="field">
          <span className="row between">
            <span className="label">Treino</span>
            <button type="button" className="text-btn small" onClick={paste}>
              <Icon name="copy" size={16} /> Colar
            </button>
          </span>
          <textarea className="textarea import-text" value={text} placeholder={PLACEHOLDER} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="button" className="btn primary block" disabled={!text.trim() || !ready} onClick={read}>
          Ler treino
        </button>
      </main>
    );
  }

  return (
    <main className="screen no-tabs">
      <TopBar
        left={
          <button type="button" className="glass circle" aria-label="Voltar ao texto" onClick={() => setDays(null)}>
            <Icon name="arrowLeft" size={22} />
          </button>
        }
        title="Conferir"
      />
      <label className="field">
        <span className="label">Nome da rotina</span>
        <input className="input" value={programName} placeholder="Rotina colada" onChange={(e) => setProgramName(e.target.value)} />
      </label>
      <div className="import-summary">
        <span className="ok">
          <Icon name="check" size={14} stroke={3} /> {counts.ok} {counts.ok === 1 ? 'encontrado' : 'encontrados'}
        </span>
        {counts.check > 0 && <span className="check">{counts.check} para conferir</span>}
        {counts.missing > 0 && <span className="missing">{counts.missing} não {counts.missing === 1 ? 'encontrado' : 'encontrados'}</span>}
      </div>

      {days.map((day, d) => (
        <section key={day.key} className="card import-day">
          <div className="row" style={{ gap: 10 }}>
            <div className="letter">{String.fromCharCode(65 + d)}</div>
            <input
              className="import-day-name"
              value={day.name}
              aria-label={`Nome do treino ${String.fromCharCode(65 + d)}`}
              onChange={(e) => setDays((prev) => prev && prev.map((x, i) => (i === d ? { ...x, name: e.target.value } : x)))}
            />
          </div>
          {day.rows.map((row, r) =>
            row.removed ? null : (
              <ImportRow
                key={row.key}
                row={row}
                ex={row.exerciseId ? map.get(row.exerciseId) : undefined}
                names={map}
                onOpen={() => setEditing({ day: d, row: r })}
                onPick={(id) => choose(d, r, id)}
              />
            ),
          )}
        </section>
      ))}

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <button type="button" className="btn big primary grow" disabled={saving || rows.length === 0} onClick={create}>
            Criar rotina
          </button>
        </div>
      </div>

      <ReplaceSheet
        open={!!editingRow}
        row={editingRow}
        list={list}
        onClose={() => setEditing(null)}
        onPick={async (id) => {
          if (editing) await choose(editing.day, editing.row, id);
          setEditing(null);
        }}
        onRemove={() => {
          if (editing) updateRow(editing.day, editing.row, { removed: true });
          setEditing(null);
        }}
      />
    </main>
  );
}

function ImportRow({
  row,
  ex,
  names,
  onOpen,
  onPick,
}: {
  row: Row;
  ex: ExerciseView | undefined;
  names: Map<string, ExerciseView>;
  onOpen: () => void;
  onPick: (id: string) => void;
}) {
  const setsText = row.line.type === 'F' ? `${row.line.sets} × até a falha` : `${row.line.sets} × ${repsText(row.line.reps)}`;
  return (
    <div className={`import-row ${row.status}`}>
      <button type="button" className="import-main" onClick={onOpen}>
        {ex ? (
          <span className="ex-avatar">
            <ExerciseThumb exercise={ex} />
          </span>
        ) : (
          <span className="import-missing-icon" aria-hidden="true">
            ?
          </span>
        )}
        <span className="col grow" style={{ gap: 2 }}>
          <span className="import-name">{ex ? ex.name : 'Não encontrado'}</span>
          <span className="tiny muted">
            {setsText} · “{row.line.name}”
          </span>
        </span>
        {row.status === 'ok' ? (
          <span className="import-status ok" aria-label="Encontrado">
            <Icon name="check" size={14} stroke={3} />
          </span>
        ) : row.status === 'check' ? (
          <span className="import-status check" aria-label="Conferir">
            !
          </span>
        ) : (
          <span className="btn small primary" style={{ pointerEvents: 'none' }}>
            Procurar
          </span>
        )}
      </button>
      {row.status === 'check' && row.candidates.length > 1 && (
        <div className="import-chips">
          {row.candidates.map((id) => (
            <button key={id} type="button" className={`import-chip ${id === row.exerciseId ? 'on' : ''}`} onClick={() => onPick(id)}>
              {names.get(id)?.name ?? id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplaceSheet({
  open,
  row,
  list,
  onClose,
  onPick,
  onRemove,
}: {
  open: boolean;
  row: Row | undefined;
  list: ExerciseView[];
  onClose: () => void;
  onPick: (id: string) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const [forKey, setForKey] = useState<string | null>(null);
  // Cada vez que abre para uma linha, a busca começa com o texto original dela.
  if (row && row.key !== forKey) {
    setForKey(row.key);
    setQuery(row.line.name);
  }

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return list.slice(0, 60);
    const nq = normalize(q);
    const ranked = rankExercises(q, list, 30).filter((r) => r.score >= 0.3).map((r) => r.ex);
    const contains = list.filter((e) => normalize(e.name).includes(nq) && !ranked.includes(e));
    return [...ranked, ...contains].slice(0, 60);
  }, [query, list]);

  return (
    <Sheet open={open} onClose={onClose} title="Trocar exercício" subtitle={row ? `“${row.line.name}”` : undefined}>
      <label className="search">
        <Icon name="search" size={20} />
        <input type="search" value={query} placeholder="Buscar exercício" aria-label="Buscar exercício" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="import-results">
        {results.length === 0 && <p className="small muted" style={{ padding: '12px 4px' }}>Nada encontrado. Tente outra palavra.</p>}
        {results.map((e) => (
          <button key={e.id} type="button" className="routine-row" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left' }} onClick={() => onPick(e.id)}>
            <span className="ex-avatar">
              <ExerciseThumb exercise={e} />
            </span>
            <span className="grow" style={{ fontWeight: 500 }}>
              {e.name}
            </span>
            {row?.exerciseId === e.id && <Icon name="check" size={18} color="var(--accent)" stroke={3} />}
          </button>
        ))}
      </div>
      <button type="button" className="btn block danger" onClick={onRemove}>
        <Icon name="trash" /> Tirar da lista
      </button>
    </Sheet>
  );
}
