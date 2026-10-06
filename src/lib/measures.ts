export const MEASURES: { key: string; name: string }[] = [
  { key: 'peito', name: 'Peito' },
  { key: 'cintura', name: 'Cintura' },
  { key: 'abdomen', name: 'Abdômen' },
  { key: 'quadril', name: 'Quadril' },
  { key: 'bracoD', name: 'Braço direito' },
  { key: 'bracoE', name: 'Braço esquerdo' },
  // As chaves antigas (antebraco, panturrilha) continuam sendo o lado direito: os registros já feitos não se perdem.
  { key: 'antebraco', name: 'Antebraço direito' },
  { key: 'antebracoE', name: 'Antebraço esquerdo' },
  { key: 'coxaD', name: 'Coxa direita' },
  { key: 'coxaE', name: 'Coxa esquerda' },
  { key: 'panturrilha', name: 'Panturrilha direita' },
  { key: 'panturrilhaE', name: 'Panturrilha esquerda' },
  { key: 'ombros', name: 'Ombros' },
  { key: 'pescoco', name: 'Pescoço' },
];
