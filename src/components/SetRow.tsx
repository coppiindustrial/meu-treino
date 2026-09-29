import { useEffect, useState } from 'react';
import { SET_TYPE_BY_ID, SET_TYPES } from '../lib/equipment';
import { num, parseNum } from '../lib/format';
import type { DoneSet, LoadUnit, PlannedSet, RepMode, SetType } from '../lib/types';
import { REST_OPTIONS, repsText, restText } from '../lib/workout';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** Check que se "desenha" ao marcar. */
function CheckMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="check-draw">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Uma série durante o treino: tipo, anterior, carga, repetições e check. */
export function SetRow({
  label,
  set,
  unit,
  onOpenMenu,
  onCommit,
  onToggle,
}: {
  label: string;
  set: DoneSet;
  unit: LoadUnit;
  onOpenMenu: () => void;
  onCommit: (changes: Partial<DoneSet>) => void;
  onToggle: (load: number | null, reps: number | null) => void;
}) {
  const [load, setLoad] = useState(set.load === null ? '' : num(set.load, 2));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  useEffect(() => setLoad(set.load === null ? '' : num(set.load, 2)), [set.load]);
  useEffect(() => setReps(set.reps === null ? '' : String(set.reps)), [set.reps]);

  const info = SET_TYPE_BY_ID[set.type];
  const prevText =
    set.prevLoad !== null && set.prevLoad !== undefined
      ? `${num(set.prevLoad)}${unit === 'placa' ? '' : ` ${unit}`} × ${set.prevReps ?? '—'}`
      : set.prevReps
        ? `${set.prevReps} reps`
        : '—';
  const repsPlaceholder = set.prevReps ? String(set.prevReps) : set.target ? repsText(set.target) : '';

  return (
    <div className={`set-row ${set.done ? 'done' : ''}`}>
      <button type="button" className={`set-type ${info.className}`} aria-label={`Série ${label}, ${info.name}. Trocar tipo`} onClick={onOpenMenu}>
        {label}
      </button>
      <span className="small muted ellipsis">{prevText}</span>
      <input
        className="set-input"
        inputMode="decimal"
        enterKeyHint="next"
        value={load}
        placeholder="—"
        aria-label={`Carga da série ${label}`}
        onChange={(e) => setLoad(e.target.value)}
        onBlur={() => {
          const v = parseNum(load);
          if (v !== set.load) onCommit({ load: v });
        }}
      />
      <input
        className="set-input"
        inputMode="numeric"
        enterKeyHint="done"
        value={reps}
        placeholder={repsPlaceholder}
        aria-label={`Repetições da série ${label}`}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => {
          const v = parseNum(reps);
          const r = v === null ? null : Math.round(v);
          if (r !== set.reps) onCommit({ reps: r });
        }}
      />
      <button
        type="button"
        className={`set-check ${set.done ? 'on' : ''}`}
        aria-pressed={set.done}
        aria-label={set.done ? `Desmarcar série ${label}` : `Marcar série ${label} como feita`}
        onClick={() => {
          const l = parseNum(load);
          const r = parseNum(reps);
          onToggle(l, r === null ? null : Math.round(r));
        }}
      >
        <CheckMark />
      </button>
    </div>
  );
}

/** Uma série planejada na rotina: tipo, carga e repetições (fixas ou faixa). */
export function PlannedSetRow({
  label,
  set,
  hint,
  repMode,
  onOpenMenu,
  onChange,
}: {
  label: string;
  set: PlannedSet;
  hint: PlannedSet | undefined;
  repMode: RepMode;
  onOpenMenu: () => void;
  onChange: (changes: Partial<PlannedSet>) => void;
}) {
  const split = (r: string) => {
    const [a = '', b = ''] = r.split('-');
    return [a.trim(), b.trim()];
  };
  const [load, setLoad] = useState(set.load === null ? '' : num(set.load, 2));
  const [min, setMin] = useState(split(set.reps)[0]);
  const [max, setMax] = useState(split(set.reps)[1]);
  useEffect(() => setLoad(set.load === null ? '' : num(set.load, 2)), [set.load]);
  useEffect(() => {
    const [a, b] = split(set.reps);
    setMin(a);
    setMax(b);
  }, [set.reps]);

  const info = SET_TYPE_BY_ID[set.type];
  const [hMin, hMax] = split(hint?.reps ?? (repMode === 'faixa' ? '8-12' : '10'));
  const commitReps = (a: string, b: string) => {
    const x = a.replace(/\D/g, '');
    const y = b.replace(/\D/g, '');
    const value = repMode === 'faixa' ? (x && y ? `${x}-${y}` : x || y) : x;
    if (value !== set.reps) onChange({ reps: value });
  };

  return (
    <div className="set-row plan">
      <button type="button" className={`set-type ${info.className}`} aria-label={`Série ${label}, ${info.name}. Trocar tipo`} onClick={onOpenMenu}>
        {label}
      </button>
      <input
        className="set-input"
        inputMode="decimal"
        value={load}
        placeholder={hint?.load !== null && hint?.load !== undefined ? num(hint.load, 2) : '—'}
        aria-label={`Carga da série ${label}`}
        onChange={(e) => setLoad(e.target.value)}
        onBlur={() => {
          const v = parseNum(load);
          if (v !== set.load) onChange({ load: v });
        }}
      />
      {repMode === 'faixa' ? (
        <span className="reps-range">
          <input
            className="set-input"
            inputMode="numeric"
            value={min}
            placeholder={hMin}
            aria-label={`Mínimo de repetições da série ${label}`}
            onChange={(e) => setMin(e.target.value)}
            onBlur={() => commitReps(min, max)}
          />
          <span className="muted">–</span>
          <input
            className="set-input"
            inputMode="numeric"
            value={max}
            placeholder={hMax || hMin}
            aria-label={`Máximo de repetições da série ${label}`}
            onChange={(e) => setMax(e.target.value)}
            onBlur={() => commitReps(min, max)}
          />
        </span>
      ) : (
        <input
          className="set-input"
          inputMode="numeric"
          value={min}
          placeholder={hMin}
          aria-label={`Repetições da série ${label}`}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => commitReps(min, '')}
        />
      )}
    </div>
  );
}

export function SetTypeSheet({
  open,
  onClose,
  current,
  subtitle,
  onPick,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  current: SetType | undefined;
  subtitle?: string;
  onPick: (type: SetType) => void;
  onRemove: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Tipo da série" subtitle={subtitle}>
      <div className="list-group">
        {SET_TYPES.map((t) => (
          <button type="button" key={t.id} className="list-item" style={{ minHeight: 60 }} aria-pressed={current === t.id} onClick={() => onPick(t.id)}>
            <span className={t.className} style={{ width: 28, textAlign: 'center', fontSize: 20, fontWeight: 800 }}>
              {t.letter}
            </span>
            <span className="col grow">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</span>
              <span className="tiny muted" style={{ fontWeight: 500 }}>
                {t.desc}
              </span>
            </span>
            {current === t.id && (
              <span className="check-dot">
                <Icon name="check" size={14} stroke={3} />
              </span>
            )}
          </button>
        ))}
        <button type="button" className="list-item danger" onClick={onRemove}>
          <span style={{ width: 28, display: 'flex', justifyContent: 'center' }}>
            <Icon name="x" stroke={2.5} />
          </span>
          <span className="grow">Remover série</span>
        </button>
      </div>
    </Sheet>
  );
}

export function RestSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: number;
  onPick: (seconds: number) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Descanso deste exercício">
      <div className="rest-grid">
        {REST_OPTIONS.map((s) => (
          <button type="button" key={s} className={`pill ${value === s ? 'on' : ''}`} aria-pressed={value === s} onClick={() => onPick(s)}>
            {restText(s)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function RepModeSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: RepMode;
  onPick: (mode: RepMode) => void;
}) {
  const options: { id: RepMode; name: string; desc: string }[] = [
    { id: 'faixa', name: 'Faixa de repetições', desc: 'Ex.: 8–12. Você escolhe mínimo e máximo.' },
    { id: 'fixa', name: 'Repetições fixas', desc: 'Ex.: 10. Um número só por série.' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Repetições">
      <div className="list-group">
        {options.map((o) => (
          <button type="button" key={o.id} className="list-item" style={{ minHeight: 60 }} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
            <span className="col grow">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{o.name}</span>
              <span className="tiny muted" style={{ fontWeight: 500 }}>
                {o.desc}
              </span>
            </span>
            {value === o.id && (
              <span className="check-dot">
                <Icon name="check" size={14} stroke={3} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
