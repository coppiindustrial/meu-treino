import { Sheet } from './Sheet';

/** Boneco simples (formas básicas) para mostrar onde passar a fita métrica. */
function Body() {
  return (
    <g fill="#4a4a50">
      <circle cx="60" cy="18" r="12" />
      <rect x="54" y="28" width="12" height="10" rx="3" />
      <path d="M38 40 Q60 34 82 40 L87 50 Q85 72 78 92 Q82 102 80 114 L40 114 Q38 102 42 92 Q35 72 33 50 Z" />
      <rect x="21" y="45" width="12" height="38" rx="6" />
      <rect x="87" y="45" width="12" height="38" rx="6" />
      <rect x="19" y="83" width="11" height="34" rx="5.5" />
      <rect x="90" y="83" width="11" height="34" rx="5.5" />
      <circle cx="24.5" cy="121" r="5" />
      <circle cx="95.5" cy="121" r="5" />
      <rect x="41" y="112" width="18" height="46" rx="8" />
      <rect x="61" y="112" width="18" height="46" rx="8" />
      <rect x="43" y="156" width="14" height="38" rx="6" />
      <rect x="63" y="156" width="14" height="38" rx="6" />
      <ellipse cx="50" cy="196" rx="8" ry="3" />
      <ellipse cx="70" cy="196" rx="8" ry="3" />
    </g>
  );
}

/** Onde fica a fita de cada medida: centro (x, y) e raios da elipse. */
const RINGS: Record<string, [number, number, number, number]> = {
  peito: [60, 56, 25, 4],
  cintura: [60, 80, 19, 3.5],
  abdomen: [60, 92, 20, 3.5],
  quadril: [60, 108, 22, 4],
  bracoD: [27, 64, 8, 2.6],
  bracoE: [93, 64, 8, 2.6],
  antebraco: [24.5, 92, 7, 2.4],
  coxaD: [50, 126, 11, 3],
  coxaE: [70, 126, 11, 3],
  panturrilha: [50, 168, 9, 2.6],
  ombros: [60, 47, 30, 4.5],
  pescoco: [60, 33, 8, 2.6],
};

export const MEASURE_HOWTO: Record<string, string> = {
  peito: 'Passe a fita na altura dos mamilos, por baixo das axilas. Respire normalmente e meça sem apertar.',
  cintura: 'Meça na parte mais fina do tronco, um pouco acima do umbigo, sem encolher a barriga.',
  abdomen: 'Passe a fita na linha do umbigo, reta em volta do corpo, no fim de uma respiração normal.',
  quadril: 'Com os pés juntos, meça na parte mais larga do bumbum, com a fita reta.',
  bracoD: 'Braço relaxado ao lado do corpo: meça no meio entre o ombro e o cotovelo. Meça sempre do mesmo jeito.',
  bracoE: 'Braço relaxado ao lado do corpo: meça no meio entre o ombro e o cotovelo. Meça sempre do mesmo jeito.',
  antebraco: 'Na parte mais grossa, logo abaixo do cotovelo, com a mão aberta e relaxada.',
  coxaD: 'Em pé, com o peso nas duas pernas: meça na parte mais grossa, logo abaixo do glúteo.',
  coxaE: 'Em pé, com o peso nas duas pernas: meça na parte mais grossa, logo abaixo do glúteo.',
  panturrilha: 'Em pé, meça na parte mais grossa da panturrilha.',
  ombros: 'Braços relaxados: passe a fita em volta dos dois ombros, na parte mais larga.',
  pescoco: 'Meça logo abaixo do pomo de adão, com a cabeça reta e olhando para a frente.',
};

export function hasMeasureFigure(key: string): boolean {
  return key in RINGS;
}

export function MeasureFigure({ measure }: { measure: string }) {
  const ring = RINGS[measure];
  if (!ring) return null;
  const [cx, cy, rx, ry] = ring;
  return (
    <svg viewBox="0 0 120 202" aria-hidden="true">
      <Body />
      {/* Parte de trás da fita (tracejada) e parte da frente (cheia). */}
      <path d={`M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy}`} fill="none" stroke="#2f8cff" strokeWidth={2} strokeDasharray="3 2.5" opacity={0.55} />
      <path d={`M${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy}`} fill="none" stroke="#2f8cff" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx + rx} cy={cy} r={2.6} fill="#ffffff" />
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
