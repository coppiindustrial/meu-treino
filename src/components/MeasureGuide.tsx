import { BODY } from '../data/bodyMap';
import { useBodyGender, type BodyGender } from '../lib/body';
import { Sheet } from './Sheet';

/** Onde fica a fita de cada medida no desenho do corpo: centro (x, y) e raios da elipse. */
const RINGS: Record<BodyGender, Record<string, [number, number, number, number]>> = {
  male: {
    peito: [364, 392, 128, 18],
    cintura: [364, 545, 100, 15],
    abdomen: [364, 600, 104, 15],
    quadril: [364, 690, 128, 18],
    bracoD: [217, 445, 40, 8],
    bracoE: [511, 445, 40, 8],
    antebraco: [172, 560, 42, 8],
    antebracoE: [556, 560, 42, 8],
    coxaD: [295, 745, 60, 12],
    coxaE: [433, 745, 60, 12],
    panturrilha: [288, 1085, 44, 10],
    panturrilhaE: [440, 1085, 44, 10],
    ombros: [364, 345, 178, 22],
    pescoco: [364, 292, 38, 8],
  },
  female: {
    peito: [320, 390, 118, 17],
    cintura: [320, 505, 86, 13],
    abdomen: [320, 560, 92, 14],
    quadril: [320, 650, 128, 18],
    bracoD: [181, 430, 34, 7],
    bracoE: [459, 430, 34, 7],
    antebraco: [122, 540, 42, 8],
    antebracoE: [518, 540, 42, 8],
    coxaD: [252, 730, 58, 12],
    coxaE: [389, 730, 58, 12],
    panturrilha: [266, 1125, 42, 10],
    panturrilhaE: [374, 1125, 42, 10],
    ombros: [320, 328, 160, 20],
    pescoco: [320, 300, 36, 8],
  },
};

export const MEASURE_HOWTO: Record<string, string> = {
  peito: 'Passe a fita na altura dos mamilos, por baixo das axilas. Respire normalmente e meça sem apertar.',
  cintura: 'Meça na parte mais fina do tronco, um pouco acima do umbigo, sem encolher a barriga.',
  abdomen: 'Passe a fita na linha do umbigo, reta em volta do corpo, no fim de uma respiração normal.',
  quadril: 'Com os pés juntos, meça na parte mais larga do bumbum, com a fita reta.',
  bracoD: 'Braço relaxado ao lado do corpo: meça no meio entre o ombro e o cotovelo. Meça sempre do mesmo jeito.',
  bracoE: 'Braço relaxado ao lado do corpo: meça no meio entre o ombro e o cotovelo. Meça sempre do mesmo jeito.',
  antebraco: 'Na parte mais grossa, logo abaixo do cotovelo, com a mão aberta e relaxada.',
  antebracoE: 'Na parte mais grossa, logo abaixo do cotovelo, com a mão aberta e relaxada.',
  coxaD: 'Em pé, com o peso nas duas pernas: meça na parte mais grossa, logo abaixo do glúteo.',
  coxaE: 'Em pé, com o peso nas duas pernas: meça na parte mais grossa, logo abaixo do glúteo.',
  panturrilha: 'Em pé, meça na parte mais grossa da panturrilha.',
  panturrilhaE: 'Em pé, meça na parte mais grossa da panturrilha.',
  ombros: 'Braços relaxados: passe a fita em volta dos dois ombros, na parte mais larga.',
  pescoco: 'Meça logo abaixo do pomo de adão, com a cabeça reta e olhando para a frente.',
};

export function hasMeasureFigure(key: string): boolean {
  return key in RINGS.male;
}

/** Contorno do corpo (só o traço) com a fita métrica azul no lugar da medida. */
export function MeasureFigure({ measure }: { measure: string }) {
  const gender = useBodyGender();
  const ring = RINGS[gender][measure];
  if (!ring) return null;
  const [cx, cy, rx, ry] = ring;
  const body = BODY[gender].front;
  const head = [...(body.parts.head?.c ?? []), ...(body.parts.hair?.c ?? [])];
  return (
    <svg viewBox={body.vb} aria-hidden="true">
      <path d={body.outline} fill="none" stroke="#a1a1a6" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {head.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#a1a1a6" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      ))}
      {/* Parte de trás da fita (tracejada) e parte da frente (cheia). */}
      <path
        d={`M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy}`}
        fill="none"
        stroke="#2f8cff"
        strokeWidth={1.6}
        strokeDasharray="3 2.5"
        vectorEffect="non-scaling-stroke"
        opacity={0.6}
      />
      <path d={`M${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy}`} fill="none" stroke="#2f8cff" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={cx + rx} cy={cy} r={14} fill="#ffffff" />
    </svg>
  );
}

export function MeasureGuideSheet({ measure, name, onClose }: { measure: string | null; name: string; onClose: () => void }) {
  return (
    <Sheet open={!!measure} onClose={onClose} title={`Como medir: ${name}`}>
      {measure && (
        <div className="stack-lg">
          <div className="measure-guide">
            <MeasureFigure measure={measure} />
          </div>
          <p style={{ lineHeight: 1.5 }}>{MEASURE_HOWTO[measure]}</p>
          <p className="small muted" style={{ lineHeight: 1.5 }}>
            Use uma fita métrica flexível, sem apertar a pele, e meça sempre no mesmo horário.
          </p>
          <button type="button" className="btn primary block" onClick={onClose}>
            Entendi
          </button>
        </div>
      )}
    </Sheet>
  );
}
