import type { EquipmentId } from '../lib/types';

/**
 * Ícones dos equipamentos (preenchidos). Barra, halter, máquina, peso do corpo, kettlebell, outro e "todos" vêm do
 * Material Design Icons (Pictogrammers, licença Apache 2.0, @mdi/svg 7.4.47); polia, smith e
 * elástico foram desenhados no mesmo estilo, porque a biblioteca não tem esses.
 */
const PATHS: Record<EquipmentId | 'todos', string> = {
  todos: 'M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3',
  // mdi:weight-lifter
  barra:
    'M12 5C10.89 5 10 5.89 10 7S10.89 9 12 9 14 8.11 14 7 13.11 5 12 5M22 1V6H20V4H4V6H2V1H4V3H20V1H22M15 11.26V23H13V18H11V23H9V11.26C6.93 10.17 5.5 8 5.5 5.5L5.5 5H7.5L7.5 5.5C7.5 8 9.5 10 12 10S16.5 8 16.5 5.5L16.5 5H18.5L18.5 5.5C18.5 8 17.07 10.17 15 11.26Z',
  // mdi:dumbbell
  halter:
    'M20.57,14.86L22,13.43L20.57,12L17,15.57L8.43,7L12,3.43L10.57,2L9.14,3.43L7.71,2L5.57,4.14L4.14,2.71L2.71,4.14L4.14,5.57L2,7.71L3.43,9.14L2,10.57L3.43,12L7,8.43L15.57,17L12,20.57L13.43,22L14.86,20.57L16.29,22L18.43,19.86L19.86,21.29L21.29,19.86L19.86,18.43L22,16.29L20.57,14.86Z',
  // mdi:seat-recline-extra (banco de máquina)
  maquina:
    'M5.35,5.64C4.45,5 4.23,3.76 4.86,2.85C5.5,1.95 6.74,1.73 7.65,2.36C8.55,3 8.77,4.24 8.14,5.15C7.5,6.05 6.26,6.27 5.35,5.64M16,19H8.93C7.45,19 6.19,17.92 5.97,16.46L4,7H2L4,16.76C4.37,19.2 6.47,21 8.94,21H16M16.23,15H11.35L10.32,10.9C11.9,11.79 13.6,12.44 15.47,12.12V10C13.84,10.3 12.03,9.72 10.78,8.74L9.14,7.47C8.91,7.29 8.65,7.17 8.38,7.09C8.06,7 7.72,6.97 7.39,7.03H7.37C6.14,7.25 5.32,8.42 5.53,9.64L6.88,15.56C7.16,17 8.39,18 9.83,18H16.68L20.5,21L22,19.5',
  // Roldana no alto, cabo e pegador.
  polia: 'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM11.2 8h1.6v7H17v2H7v-2h4.2zM3 2h2v20H3zM6 20h15v2H6z',
  // Duas colunas com a barra presa nelas.
  smith: 'M4 2h2v20H4zM18 2h2v20h-2zM2 10h20v2.2H2zM8 7.5h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zm6 0h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  // mdi:human-handsup
  peso_corpo:
    'M5,1C5,3.7 6.56,6.16 9,7.32V22H11V15H13V22H15V7.31C17.44,6.16 19,3.7 19,1H17A5,5 0 0,1 12,6A5,5 0 0,1 7,1M12,1C10.89,1 10,1.89 10,3C10,4.11 10.89,5 12,5C13.11,5 14,4.11 14,3C14,1.89 13.11,1 12,1Z',
  // mdi:kettlebell
  kettlebell:
    'M16.2 10.7L16.8 8.3C16.9 8 17.3 6.6 16.5 5.4C15.9 4.5 14.7 4 13 4H11C9.3 4 8.1 4.5 7.5 5.4C6.7 6.6 7.1 7.9 7.2 8.3L7.8 10.7C6.7 11.8 6 13.3 6 15C6 17.1 7.1 18.9 8.7 20H15.3C16.9 18.9 18 17.1 18 15C18 13.3 17.3 11.8 16.2 10.7M9.6 9.5L9.1 7.8V7.7C9.1 7.7 8.9 7 9.2 6.6C9.4 6.2 10 6 11 6H13C13.9 6 14.6 6.2 14.9 6.5C15.2 6.9 15 7.6 15 7.6L14.5 9.5C13.7 9.2 12.9 9 12 9C11.1 9 10.3 9.2 9.6 9.5Z',
  // Faixa elástica presa nas duas pontas.
  elastico:
    'M4 4.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm16 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM5.6 7.4c1.6.6 2.4 3 3.2 5.6.9 2.9 1.6 4.5 3.2 4.5s2.3-1.6 3.2-4.5c.8-2.6 1.6-5 3.2-5.6l.7 1.9c-.7.3-1.3 2.3-2 4.3-1 3.2-2.1 5.9-5.1 5.9s-4.1-2.7-5.1-5.9c-.7-2-1.3-4-2-4.3z',
  // mdi:dots-horizontal
  outro:
    'M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z',
};

export function EquipmentIcon({ id, size = 24, color = 'currentColor' }: { id: EquipmentId | 'todos'; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d={PATHS[id]} />
    </svg>
  );
}
