import { pad2 } from '../lib/format';

/**
 * Tempo para os quadradinhos: "1h 02min" com os números grandes e "h"/"min" menores,
 * para caber numa linha só (mesmas contas de duration(), em src/lib/format.ts).
 */
export function Duration({ minutes }: { minutes: number }) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) {
    return (
      <span className="dur">
        {m}
        <small> min</small>
      </span>
    );
  }
  return (
    <span className="dur">
      {Math.floor(m / 60)}
      <small>h</small> {pad2(m % 60)}
      <small>min</small>
    </span>
  );
}
