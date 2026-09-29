// Toque: efeito de vidro que cresce e volta, e vibração leve (como no Hevy).

const HAPTICS_KEY = 'mt.haptics';

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
  } catch {
    // sem armazenamento: fica ligado
  }
}

/**
 * Vibração curtinha. No Android usa navigator.vibrate; no iPhone (iOS 18+) o Safari não
 * deixa vibrar direto, mas o interruptor nativo (<input switch>) dá um toque ao ser acionado.
 * Precisa ser chamada dentro de um toque do usuário.
 */
export function haptic(): void {
  if (!hapticsEnabled()) return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
      return;
    }
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // aparelho sem vibração
  }
}

const PRESSABLE = '.glass, .pill-primary';
const VIBRATE_ON =
  '.glass, .pill-primary, .btn, .tab, .set-check, .check-circle, .set-type, .seg > *, .cal-day, .list-item, .unit-toggle, .import-chip, .switch';

/** Liga o efeito de pressionar (visível até em toque rápido) e a vibração nos botões. */
export function installTouchFeedback(): void {
  // No iPhone, o Safari só mostra :active se houver um ouvinte de toque.
  document.addEventListener('touchstart', () => undefined, { passive: true });

  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', `${e.clientX - r.left}px`);
      el.style.setProperty('--y', `${e.clientY - r.top}px`);
      el.classList.add('pressed');
      const started = performance.now();
      const release = () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        // Segura o efeito um pouquinho para aparecer mesmo num toque rápido.
        setTimeout(() => el.classList.remove('pressed'), Math.max(0, 150 - (performance.now() - started)));
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    },
    { passive: true },
  );

  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(VIBRATE_ON) as HTMLElement | null;
      if (el && !(el as HTMLButtonElement).disabled) haptic();
    },
    true,
  );
}
