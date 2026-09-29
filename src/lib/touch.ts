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

const PRESSABLE = '.glass, .pill-primary';
const VIBRATE_ON = [
  '.glass',
  '.pill-primary',
  '.btn',
  '.tab',
  '.set-check',
  '.check-circle',
  '.set-type',
  '.seg > a',
  '.cal-day',
  '.list-item',
  '.action-item',
  '.folder-head',
  '.unit-toggle',
  '.import-chip',
  '.ex-chip',
].join(', ');

const canVibrate = () => typeof navigator.vibrate === 'function';
const isTouchIOS = () => !canVibrate() && 'ontouchstart' in window;

/** Vibração curtinha no Android. No iPhone ela vem do toque no interruptor escondido (veja abaixo). */
function vibrateAndroid(): void {
  if (!hapticsEnabled() || !canVibrate()) return;
  try {
    navigator.vibrate(8);
  } catch {
    // aparelho sem vibração
  }
}

/**
 * iPhone: desde o iOS 26.5 o Safari só vibra quando o próprio dedo aciona um interruptor
 * (<input type="checkbox" switch>). Então, ao soltar o dedo de um botão, uma película invisível
 * ligada a esse interruptor aparece embaixo dele. O clique cai nela (o iPhone vibra) e é
 * repassado ao botão, que funciona normalmente. Se o iPhone não usar a película, o botão
 * recebe o clique direto (só não vibra).
 */
function installIOSHaptics(): void {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'mt-haptic-switch';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';

  const film = document.createElement('label');
  film.htmlFor = input.id;
  film.setAttribute('aria-hidden', 'true');
  film.style.cssText =
    'position:fixed;width:56px;height:56px;margin:-28px 0 0 -28px;z-index:2147483647;opacity:0;display:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
  document.body.append(input, film);

  let host: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    film.style.display = 'none';
    host = null;
  };

  // Guarda o botão tocado. Campos de texto, data e hora ficam de fora (o toque neles segue normal).
  document.addEventListener(
    'touchstart',
    (e) => {
      host = null;
      if (!hapticsEnabled() || e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target?.closest || target.closest('input, select, textarea, [contenteditable]')) return;
      const el = target.closest(VIBRATE_ON) as HTMLElement | null;
      if (!el || el.tagName === 'LABEL' || (el as HTMLButtonElement).disabled) return;
      host = el;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { capture: true, passive: true },
  );
  // Arrastou (rolando a tela): não é um toque.
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (host && t && Math.hypot(t.clientX - startX, t.clientY - startY) > 10) host = null;
    },
    { capture: true, passive: true },
  );
  // Ao soltar o dedo, a película aparece embaixo dele: o clique que vem em seguida cai nela.
  document.addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches[0];
      if (!host || !t) return;
      film.style.left = `${t.clientX}px`;
      film.style.top = `${t.clientY}px`;
      film.style.display = 'block';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 450);
    },
    { capture: true, passive: true },
  );
  document.addEventListener('touchcancel', hide, { capture: true, passive: true });

  film.addEventListener('click', (e) => {
    // Não cancela o clique: é ele que liga o interruptor e faz o iPhone vibrar.
    e.stopPropagation();
    const target = host;
    hide();
    if (target && target.isConnected) target.click();
  });
}

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

  if (isTouchIOS()) {
    installIOSHaptics();
  } else {
    document.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        const el = (e.target as Element | null)?.closest?.(VIBRATE_ON) as HTMLElement | null;
        if (el && !(el as HTMLButtonElement).disabled) vibrateAndroid();
      },
      true,
    );
  }
}
