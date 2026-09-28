import { EQUIPMENT } from '../lib/equipment';
import { MUSCLE_BY_ID, MUSCLE_SECTIONS } from '../lib/muscles';
import type { EquipmentId, MuscleId } from '../lib/types';
import { Icon } from './Icon';
import { MuscleFigure } from './MuscleFigure';
import { Sheet } from './Sheet';

interface MuscleSingleProps {
  open: boolean;
  onClose: () => void;
  value: MuscleId | null;
  onSelect: (value: MuscleId | null) => void;
  allowAll?: boolean;
  title?: string;
}

/** Grade de grupos musculares com o bonequinho (escolhe um). */
export function MusclePicker({ open, onClose, value, onSelect, allowAll, title }: MuscleSingleProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title ?? 'Grupo muscular'}>
      {allowAll && (
        <button
          type="button"
          className={`muscle-card ${value === null ? 'on' : ''}`}
          aria-pressed={value === null}
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          <span className="figure-wrap">
            <MuscleFigure muscle="todos" />
          </span>
          <span className="grow">Todos os músculos</span>
          {value === null && (
            <span className="check-dot">
              <Icon name="check" size={14} stroke={3} />
            </span>
          )}
        </button>
      )}
      {MUSCLE_SECTIONS.map((sec) => (
        <div key={sec.title} className="stack">
          <span className="label">{sec.title}</span>
          <div className="muscle-grid">
            {sec.ids.map((id) => (
              <button
                type="button"
                key={id}
                className={`muscle-card ${value === id ? 'on' : ''}`}
                aria-pressed={value === id}
                onClick={() => {
                  onSelect(id);
                  onClose();
                }}
              >
                <span className="figure-wrap">
                  <MuscleFigure muscle={id} />
                </span>
                <span className="grow">{MUSCLE_BY_ID[id].name}</span>
                {value === id && (
                  <span className="check-dot">
                    <Icon name="check" size={14} stroke={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

interface MuscleMultiProps {
  open: boolean;
  onClose: () => void;
  values: MuscleId[];
  onChange: (values: MuscleId[]) => void;
  exclude?: MuscleId | null;
}

/** Mesma grade, mas escolhendo vários (músculos secundários). */
export function MuscleMultiPicker({ open, onClose, values, onChange, exclude }: MuscleMultiProps) {
  const toggle = (id: MuscleId) => {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Outros músculos" subtitle="Escolha quantos quiser">
      {MUSCLE_SECTIONS.map((sec) => (
        <div key={sec.title} className="stack">
          <span className="label">{sec.title}</span>
          <div className="muscle-grid">
            {sec.ids
              .filter((id) => id !== exclude && id !== 'cardio' && id !== 'corpo')
              .map((id) => {
                const on = values.includes(id);
                return (
                  <button
                    type="button"
                    key={id}
                    className={`muscle-card ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(id)}
                  >
                    <span className="figure-wrap">
                      <MuscleFigure muscle={id} />
                    </span>
                    <span className="grow">{MUSCLE_BY_ID[id].name}</span>
                    {on && (
                      <span className="check-dot">
                        <Icon name="check" size={14} stroke={3} />
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <button type="button" className="btn big block primary" onClick={onClose}>
        Pronto
      </button>
    </Sheet>
  );
}

interface EquipmentProps {
  open: boolean;
  onClose: () => void;
  value: EquipmentId | null;
  onSelect: (value: EquipmentId | null) => void;
  allowAll?: boolean;
}

export function EquipmentPicker({ open, onClose, value, onSelect, allowAll }: EquipmentProps) {
  const options: { id: EquipmentId | null; name: string }[] = [
    ...(allowAll ? [{ id: null, name: 'Todos os equipamentos' }] : []),
    ...EQUIPMENT,
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Equipamento">
      <div className="list-group">
        {options.map((o) => (
          <button
            type="button"
            key={o.id ?? 'todos'}
            className="list-item"
            aria-pressed={value === o.id}
            onClick={() => {
              onSelect(o.id);
              onClose();
            }}
          >
            <span className="grow">{o.name}</span>
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
