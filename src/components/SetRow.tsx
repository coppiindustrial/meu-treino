import { useEffect, useState } from 'react';
import { SET_TYPE_BY_ID, SET_TYPES } from '../lib/equipment';
import { num } from '../lib/format';
import { cardioSetText, distText, formatDuration, parseDistance } from '../lib/cardio';
import type { DistUnit, DoneSet, LoadUnit, LogType, PlannedSet, RepMode, SetType } from '../lib/types';
import { REST_OPTIONS, repsText, restText } from '../lib/workout';
import { DurationSheet } from './DurationWheel';
import { Icon } from './Icon';
import { loadText, SetWheelSheet } from './SetWheel';
import { Sheet } from './Sheet';

/** Check que se "desenha" ao marcar. */
function CheckMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="check-draw">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Campo de tempo: tocar abre as roletas de minutos e segundos. */
function DurationInput({ value, hint, label, onCommit }: { value: number | null | undefined; hint: number | null | undefined; label: string; onCommit: (secs: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const has = value !== null && value !== undefined;
  return (
    <>
      <button type="button" className={`set-input dur-input ${has ? '' : 'blank'}`} aria-label={label} onClick={() => setOpen(true)}>
        {has ? formatDuration(value) : formatDuration(hint) || '0:00'}
      </button>
      <DurationSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        start={value ?? hint ?? 0}
        canClear={has}
        onDone={(secs) => {
          setOpen(false);
          if (secs !== (value ?? null)) onCommit(secs);
        }}
      />
    </>
  );
}

/** Campo de distância (km com decimais ou metros inteiros). */
function DistanceInput({ value, unit, placeholder, label, fieldId, onCommit }: { value: number | null | undefined; unit: DistUnit; placeholder: string; label: string; fieldId?: string; onCommit: (dist: number | null) => void }) {
  const show = (v: number | null | undefined) => (v === null || v === undefined ? '' : unit === 'm' ? String(Math.round(v)) : num(v, 2));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="set-input"
      data-dist={fieldId}
      inputMode={unit === 'm' ? 'numeric' : 'decimal'}
      enterKeyHint="next"
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = parseDistance(text, unit);
        if (v !== (value ?? null)) onCommit(v);
      }}
    />
  );
}

const distPlaceholder = (v: number | null | undefined, unit: DistUnit) => (v === null || v === undefined ? '' : distText(v, unit).replace(/ (km|m)$/, ''));

/** "24 kg × 10" (ou "9,4 km · 30:00" no cardio) do que foi feito da última vez. */
export function prevSetText(p: { load?: number | null; reps?: number | null; secs?: number | null; dist?: number | null } | undefined, unit: LoadUnit, logType: LogType, distUnit: DistUnit): string {
  if (!p) return '—';
  if (logType !== 'carga') return p.secs || p.dist ? cardioSetText({ secs: p.secs, dist: p.dist }, distUnit) : '—';
  if (p.load !== null && p.load !== undefined) return `${num(p.load)}${unit === 'placa' ? '' : ` ${unit}`} × ${p.reps ?? '—'}`;
  return p.reps ? `${p.reps} reps` : '—';
}

const loadPlaceholder = (v: number | null | undefined) => (v === null || v === undefined ? '' : num(v, 2));

/** Primeiro número das repetições ("8-12" → 8), ou o padrão. */
const firstReps = (r: string | null | undefined, fallback: number) => Number(String(r ?? '').split('-')[0]) || fallback;

/** Uma série durante o treino: tipo, anterior, carga, repetições e check. */
export function SetRow({
  label,
  set,
  unit,
  name,
  logType = 'carga',
  distUnit = 'km',
  fieldId,
  onOpenMenu,
  onCommit,
  onToggle,
}: {
  label: string;
  set: DoneSet;
  unit: LoadUnit;
  /** Nome do exercício (título da roleta). */
  name?: string;
  /** Identifica o campo de distância (o cronômetro do cardio foca nele ao concluir). */
  fieldId?: string;
  logType?: LogType;
  distUnit?: DistUnit;
  onOpenMenu: () => void;
  onCommit: (changes: Partial<DoneSet>) => void;
  onToggle: (values: Partial<DoneSet>) => void;
}) {
  const [wheelOpen, setWheelOpen] = useState(false);
  const info = SET_TYPE_BY_ID[set.type];
  const prevText = prevSetText({ load: set.prevLoad, reps: set.prevReps }, unit, 'carga', distUnit);
  const repsPlaceholder = set.prevReps ? String(set.prevReps) : set.target ? repsText(set.target) : '';

  const typeButton = (
    <button type="button" className={`set-type ${info.className}`} aria-label={`Série ${label}, ${info.name}. Trocar tipo`} onClick={onOpenMenu}>
      {label}
    </button>
  );
  const check = (values: Partial<DoneSet>) => (
    <button
      type="button"
      className={`set-check ${set.done ? 'on' : ''}`}
      aria-pressed={set.done}
      aria-label={set.done ? `Desmarcar série ${label}` : `Marcar série ${label} como feita`}
      onClick={() => onToggle(values)}
    >
      <CheckMark />
    </button>
  );

  // Cardio: distância e/ou tempo no lugar de carga e repetições.
  if (logType !== 'carga') {
    const hasPrev = set.prevSecs || set.prevDist;
    const prev = hasPrev ? cardioSetText({ secs: set.prevSecs, dist: set.prevDist }, distUnit) : '—';
    const withDist = logType !== 'tempo';
    return (
      <div className={`set-row ${withDist ? 'c-tk' : 'c-t'} ${set.done ? 'done' : ''}`}>
        {typeButton}
        <span className="small muted ellipsis">{prev}</span>
        {withDist && (
          <DistanceInput
            value={set.dist}
            unit={distUnit}
            placeholder={distPlaceholder(set.targetDist ?? set.prevDist, distUnit)}
            label={`Distância da série ${label}`}
            fieldId={fieldId}
            onCommit={(dist) => onCommit({ dist })}
          />
        )}
        <DurationInput value={set.secs} hint={set.targetSecs ?? set.prevSecs} label={`Tempo da série ${label}`} onCommit={(secs) => onCommit({ secs })} />
        {check({})}
      </div>
    );
  }

  // Carga e repetições abrem a mesma janela de roletas (carga à esquerda, repetições à direita).
  const loadLabel = set.load !== null ? loadText(set.load) : loadPlaceholder(set.prevLoad);
  const repsLabel = set.reps !== null ? String(set.reps) : repsPlaceholder;
  return (
    <div className={`set-row ${set.done ? 'done' : ''}`}>
      {typeButton}
      <span className="small muted ellipsis">{prevText}</span>
      <button type="button" className={`set-input dur-input ${set.load === null ? 'blank' : ''}`} aria-label={`Carga da série ${label}`} onClick={() => setWheelOpen(true)}>
        {loadLabel}
      </button>
      <button type="button" className={`set-input dur-input ${set.reps === null ? 'blank' : ''}`} aria-label={`Repetições da série ${label}`} onClick={() => setWheelOpen(true)}>
        {repsLabel}
      </button>
      {check({})}
      {wheelOpen && (
        <SetWheelSheet
          onClose={() => setWheelOpen(false)}
          title={name ?? `Série ${label}`}
          subtitle={name ? `Série ${label}` : undefined}
          unit={unit}
          load={set.load}
          loadStart={set.prevLoad ?? null}
          reps={[set.reps ?? set.prevReps ?? firstReps(set.target, 10)]}
          range={false}
          canClear={set.load !== null || set.reps !== null}
          onSave={(load, [reps]) => {
            setWheelOpen(false);
            const changes: Partial<DoneSet> = {};
            if (load !== set.load) changes.load = load;
            if (reps !== set.reps) changes.reps = reps;
            if (Object.keys(changes).length) onCommit(changes);
          }}
          onClear={() => {
            setWheelOpen(false);
            onCommit({ load: null, reps: null });
          }}
        />
      )}
    </div>
  );
}

/** Uma série planejada na rotina: tipo, carga e repetições (fixas ou faixa). */
export function PlannedSetRow({
  label,
  set,
  hint,
  prev,
  unit,
  name,
  repMode,
  logType = 'carga',
  distUnit = 'km',
  onOpenMenu,
  onChange,
}: {
  label: string;
  set: PlannedSet;
  hint: PlannedSet | undefined;
  /** O que foi feito nessa série da última vez (coluna "Anterior"). */
  prev: DoneSet | undefined;
  unit: LoadUnit;
  /** Nome do exercício (título da roleta). */
  name?: string;
  repMode: RepMode;
  logType?: LogType;
  distUnit?: DistUnit;
  onOpenMenu: () => void;
  onChange: (changes: Partial<PlannedSet>) => void;
}) {
  const split = (r: string) => {
    const [a = '', b = ''] = r.split('-');
    return [a.trim(), b.trim()];
  };
  const [wheelOpen, setWheelOpen] = useState(false);
  const faixa = repMode === 'faixa';
  const [min, max] = split(set.reps);
  const info = SET_TYPE_BY_ID[set.type];
  const [hMin, hMax] = split(hint?.reps ?? (faixa ? '8-12' : '10'));
  const prevCell = <span className="small muted ellipsis set-prev">{prevSetText(prev, unit, logType, distUnit)}</span>;
  const repsShown = min ? (faixa && max ? `${min}–${max}` : min) : null;
  const repsHint = faixa ? `${hMin}–${hMax || hMin}` : hMin;
  const planLoad = set.load !== null ? loadText(set.load) : loadPlaceholder(hint?.load ?? prev?.load);

  if (logType !== 'carga') {
    const withDist = logType !== 'tempo';
    return (
      <div className={`set-row plan ${withDist ? 'c-tk' : 'c-t'}`}>
        <button type="button" className={`set-type ${info.className}`} aria-label={`Série ${label}, ${info.name}. Trocar tipo`} onClick={onOpenMenu}>
          {label}
        </button>
        {prevCell}
        {withDist && (
          <DistanceInput
            value={set.dist}
            unit={distUnit}
            placeholder={distPlaceholder(hint?.dist ?? prev?.dist, distUnit)}
            label={`Meta de distância da série ${label}`}
            onCommit={(dist) => onChange({ dist })}
          />
        )}
        <DurationInput value={set.secs} hint={hint?.secs ?? prev?.secs} label={`Meta de tempo da série ${label}`} onCommit={(secs) => onChange({ secs })} />
      </div>
    );
  }

  return (
    <div className="set-row plan">
      <button type="button" className={`set-type ${info.className}`} aria-label={`Série ${label}, ${info.name}. Trocar tipo`} onClick={onOpenMenu}>
        {label}
      </button>
      {prevCell}
      <button type="button" className={`set-input dur-input ${set.load === null ? 'blank' : ''}`} aria-label={`Carga da série ${label}`} onClick={() => setWheelOpen(true)}>
        {planLoad}
      </button>
      <button
        type="button"
        className={`set-input dur-input ${repsShown ? '' : 'blank'}`}
        aria-label={faixa ? `Faixa de repetições da série ${label}` : `Repetições da série ${label}`}
        onClick={() => setWheelOpen(true)}
      >
        {repsShown ?? repsHint}
      </button>
      {wheelOpen && (
        <SetWheelSheet
          onClose={() => setWheelOpen(false)}
          title={name ?? `Série ${label}`}
          subtitle={name ? `Série ${label}` : undefined}
          unit={unit}
          load={set.load}
          loadStart={hint?.load ?? prev?.load ?? null}
          reps={faixa ? [Number(min || hMin) || 8, Number(max || hMax || min || hMin) || 12] : [Number(min || hMin) || 10]}
          range={faixa}
          canClear={set.load !== null || !!set.reps}
          onSave={(load, [a, b]) => {
            setWheelOpen(false);
            const reps = faixa ? `${a}-${b ?? a}` : String(a);
            const changes: Partial<PlannedSet> = {};
            if (load !== set.load) changes.load = load;
            if (reps !== set.reps) changes.reps = reps;
            if (Object.keys(changes).length) onChange(changes);
          }}
          onClear={() => {
            setWheelOpen(false);
            onChange({ load: null, reps: '' });
          }}
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
