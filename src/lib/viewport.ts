/**
 * No iPhone, depois que o teclado fecha, às vezes a tela não volta para o lugar: a parte visível fica
 * deslocada da área de layout, e o que é "fixed" embaixo (descanso, cardio, abas) fica preso no meio da
 * tela até fechar o app. Aqui medimos onde está o fundo visível e guardamos em --vv-fix quantos px essas
 * barras precisam descer. Normalmente é 0. Com um campo em foco (teclado aberto) também é 0: a barra fica
 * atrás do teclado, como sempre.
 */
export function installViewportFix(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  let last = 0;

  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable]');
      const gap = Math.round(vv.offsetTop + vv.height - window.innerHeight);
      // Só corrige quando o fundo visível está abaixo do fundo do layout (o caso do teclado que fechou).
      const fix = typing || gap <= 1 ? 0 : gap;
      if (fix === last) return;
      last = fix;
      root.style.setProperty('--vv-fix', `${fix}px`);
    });
  };

  vv.addEventListener('resize', measure);
  vv.addEventListener('scroll', measure);
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, { passive: true });
  document.addEventListener('focusin', measure);
  // O teclado leva um tempo para descer: mede de novo quando a animação já acabou.
  document.addEventListener('focusout', () => {
    measure();
    setTimeout(measure, 350);
    setTimeout(measure, 800);
  });
  document.addEventListener('visibilitychange', measure);
  measure();
}
