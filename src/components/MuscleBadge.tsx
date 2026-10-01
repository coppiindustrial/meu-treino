import { useMemo } from 'react';
import { musclesDrawing, useBodyGender } from '../lib/body';
import { THEME } from '../lib/theme';
import type { MuscleId } from '../lib/types';

const FILL = { main: THEME.accent, also: '#1D5AA6', skin: THEME.figureSkin, base: THEME.figureBase };

/** Quadradinho no canto da foto do exercício: o músculo principal em azul e os que também trabalham em azul escuro. */
export function MuscleBadge({ primary, secondary }: { primary: MuscleId; secondary: MuscleId[] }) {
  const gender = useBodyGender();
  const key = secondary.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawing = useMemo(() => musclesDrawing(gender, primary, secondary), [gender, primary, key]);
  if (!drawing) return null;
  return (
    <span className="muscle-badge" aria-hidden="true">
      <svg viewBox={drawing.viewBox} width="100%" height="100%">
        {drawing.paths.map((p, i) => (
          <path key={i} d={p.d} fill={FILL[p.tone]} stroke="#000" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </span>
  );
}
