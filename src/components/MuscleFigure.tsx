import { useMemo } from 'react';
import { bodyParts, muscleTest, muscleView, muscleViewBox, NON_MUSCLE, useBodyGender } from '../lib/body';
import { MUSCLE_BY_ID } from '../lib/muscles';
import { THEME } from '../lib/theme';
import type { MuscleId } from '../lib/types';
import { Icon } from './Icon';

/** Desenho anatômico aproximado na região do músculo, com ele em azul. */
export function MuscleFigure({ muscle, size = 46 }: { muscle: MuscleId | 'todos'; size?: number }) {
  const gender = useBodyGender();
  const info = muscle === 'todos' ? undefined : MUSCLE_BY_ID[muscle];
  const drawing = useMemo(() => {
    if (!info || info.view === 'i' || muscle === 'todos') return null;
    const test = muscleTest(muscle);
    return {
      viewBox: muscleViewBox(gender, muscle),
      paths: bodyParts(gender, muscleView(muscle)).map((p) => ({
        d: p.d,
        fill: test(p) ? THEME.accent : NON_MUSCLE.has(p.slug) ? THEME.figureSkin : THEME.figureBase,
      })),
    };
  }, [gender, muscle, info]);

  if (muscle === 'todos') return <Icon name="grid" size={Math.round(size * 0.45)} color={THEME.accent} />;
  if (!drawing) return <Icon name="heart" size={Math.round(size * 0.55)} color={THEME.accent} />;
  return (
    <svg width={size} height={size} viewBox={drawing.viewBox} aria-hidden="true">
      {drawing.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke="#000" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
