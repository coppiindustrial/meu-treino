import { LOG_TYPES } from '../lib/cardio';
import type { DistUnit, LogType } from '../lib/types';
import { Icon } from './Icon';

/** "Tipo de registro" (carga, só tempo, tempo e km, tiros) e a unidade de distância do cardio. */
export function LogTypePicker({
  value,
  distUnit,
  onType,
  onDistUnit,
}: {
  value: LogType;
  distUnit: DistUnit;
  onType: (t: LogType) => void;
  onDistUnit: (u: DistUnit) => void;
}) {
  return (
    <div className="stack" style={{ marginBottom: 14 }}>
      <span className="label">Tipo de registro</span>
      <div className="list-group">
        {LOG_TYPES.map((t) => (
          <button key={t.id} type="button" className="list-item" aria-pressed={value === t.id} onClick={() => onType(t.id)}>
            <span className="col grow" style={{ gap: 1 }}>
              <span>{t.name}</span>
              <span className="tiny muted" style={{ fontWeight: 500 }}>
                {t.desc}
              </span>
            </span>
            {value === t.id && (
              <span className="check-dot">
                <Icon name="check" size={14} stroke={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      {(value === 'tempo_km' || value === 'tiros') && (
        <div className="field">
          <span className="label">Distância em</span>
          <div className="seg">
            {(['km', 'm'] as DistUnit[]).map((u) => (
              <button key={u} type="button" className={distUnit === u ? 'on' : ''} aria-pressed={distUnit === u} onClick={() => onDistUnit(u)}>
                {u === 'km' ? 'Quilômetros' : 'Metros'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
