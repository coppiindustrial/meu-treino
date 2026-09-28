import { THEME } from '../lib/theme';
import { MUSCLE_BY_ID } from '../lib/muscles';
import type { MuscleId } from '../lib/types';
import { Icon } from './Icon';

const BASE = THEME.figureBase;
const HI = THEME.accent;
const EDGE = THEME.bg;

function fill(on: Set<string>, part: string) {
  return on.has(part) ? HI : BASE;
}

/** Bonequinho com o músculo destacado (frente ou costas). */
export function MuscleFigure({ muscle, size = 42 }: { muscle: MuscleId | 'todos'; size?: number }) {
  if (muscle === 'todos') {
    return <Icon name="grid" size={Math.round(size * 0.45)} color={HI} />;
  }
  const info = MUSCLE_BY_ID[muscle];
  if (!info || info.view === 'i') {
    return <Icon name="heart" size={Math.round(size * 0.55)} color={HI} />;
  }
  const on = new Set(info.parts);
  const f = (p: string) => fill(on, p);
  const common = { stroke: EDGE, strokeWidth: 0.8 };

  if (info.view === 'f') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="5.5" r="3.3" fill={BASE} />
        <rect x="22.4" y="8.6" width="3.2" height="2.6" rx="1" fill={f('neck')} {...common} />
        <rect x="18.3" y="16.6" width="11.4" height="10.4" rx="2" fill={f('sides')} {...common} />
        <ellipse cx="16.6" cy="13" rx="2.6" ry="2.4" fill={f('delts')} {...common} />
        <ellipse cx="31.4" cy="13" rx="2.6" ry="2.4" fill={f('delts')} {...common} />
        <rect x="18.6" y="11.2" width="5.1" height="5.4" rx="1.6" fill={f('chest')} {...common} />
        <rect x="24.3" y="11.2" width="5.1" height="5.4" rx="1.6" fill={f('chest')} {...common} />
        <rect x="20" y="17.4" width="8" height="9" rx="1.8" fill={f('abs')} {...common} />
        <ellipse cx="15.2" cy="18.2" rx="1.8" ry="3.2" fill={f('biceps')} {...common} />
        <ellipse cx="32.8" cy="18.2" rx="1.8" ry="3.2" fill={f('biceps')} {...common} />
        <ellipse cx="14.2" cy="24.8" rx="1.5" ry="3.2" fill={f('forearms')} {...common} />
        <ellipse cx="33.8" cy="24.8" rx="1.5" ry="3.2" fill={f('forearms')} {...common} />
        <rect x="19" y="26.8" width="10" height="3.4" rx="1.4" fill={f('pelvis')} {...common} />
        <rect x="18.8" y="30.6" width="4.6" height="8.4" rx="2.2" fill={f('quads')} {...common} />
        <rect x="24.6" y="30.6" width="4.6" height="8.4" rx="2.2" fill={f('quads')} {...common} />
        <rect x="23.1" y="30.6" width="1.8" height="5.6" rx="0.9" fill={f('adductors')} stroke={EDGE} strokeWidth={0.6} />
        <rect x="19.4" y="39.8" width="3.6" height="6.6" rx="1.8" fill={f('shins')} {...common} />
        <rect x="25" y="39.8" width="3.6" height="6.6" rx="1.8" fill={f('shins')} {...common} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="5.5" r="3.3" fill={BASE} />
      <rect x="22.4" y="8.6" width="3.2" height="2.6" rx="1" fill={f('neck')} {...common} />
      <rect x="18.3" y="15" width="11.4" height="12" rx="2" fill={BASE} {...common} />
      <ellipse cx="16.6" cy="13" rx="2.6" ry="2.4" fill={f('delts')} {...common} />
      <ellipse cx="31.4" cy="13" rx="2.6" ry="2.4" fill={f('delts')} {...common} />
      <rect x="19.8" y="14.8" width="8.4" height="4" rx="1.4" fill={f('upper')} {...common} />
      <polygon points="20,10.2 28,10.2 30.6,12.8 24,15.4 17.4,12.8" fill={f('traps')} {...common} />
      <polygon points="18.4,15.8 22.6,19.4 22.4,24.2 19,22.4" fill={f('lats')} {...common} />
      <polygon points="29.6,15.8 25.4,19.4 25.6,24.2 29,22.4" fill={f('lats')} {...common} />
      <rect x="21.2" y="21.4" width="5.6" height="5.2" rx="1.4" fill={f('lower')} {...common} />
      <ellipse cx="15.2" cy="18.2" rx="1.8" ry="3.2" fill={f('triceps')} {...common} />
      <ellipse cx="32.8" cy="18.2" rx="1.8" ry="3.2" fill={f('triceps')} {...common} />
      <ellipse cx="14.2" cy="24.8" rx="1.5" ry="3.2" fill={f('forearms')} {...common} />
      <ellipse cx="33.8" cy="24.8" rx="1.5" ry="3.2" fill={f('forearms')} {...common} />
      <ellipse cx="18.4" cy="28.4" rx="1.2" ry="2.1" fill={f('abductors')} stroke={EDGE} strokeWidth={0.6} />
      <ellipse cx="29.6" cy="28.4" rx="1.2" ry="2.1" fill={f('abductors')} stroke={EDGE} strokeWidth={0.6} />
      <ellipse cx="21.7" cy="29.4" rx="2.9" ry="2.5" fill={f('glutes')} {...common} />
      <ellipse cx="26.3" cy="29.4" rx="2.9" ry="2.5" fill={f('glutes')} {...common} />
      <rect x="18.8" y="32.4" width="4.6" height="7" rx="2.2" fill={f('hams')} {...common} />
      <rect x="24.6" y="32.4" width="4.6" height="7" rx="2.2" fill={f('hams')} {...common} />
      <ellipse cx="21.1" cy="42.8" rx="2" ry="3.4" fill={f('calves')} {...common} />
      <ellipse cx="26.9" cy="42.8" rx="2" ry="3.4" fill={f('calves')} {...common} />
    </svg>
  );
}
