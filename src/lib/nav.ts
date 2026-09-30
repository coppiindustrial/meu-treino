export type NavDir = 'forward' | 'back' | 'tab' | 'none';

type DocWithVT = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => unknown;
};

/**
 * Troca de tela com animação (View Transitions). A tela antiga fica "congelada"
 * enquanto a nova carrega os dados, e então desliza. Sem suporte, troca na hora.
 */
export function withTransition(dir: NavDir, update: () => void): void {
  const doc = document as DocWithVT;
  // Abas e seletores trocam na hora (a bolha já anda no toque); só as telas internas deslizam.
  if (dir === 'tab' || dir === 'none') {
    document.documentElement.dataset.nav = dir;
    update();
    return;
  }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    update();
    return;
  }
  document.documentElement.dataset.nav = dir;
  // Durante a animação o vidro fica sem desfoque: nas "fotos" da troca de tela o Safari desenhava
  // o desfoque errado (borrão no lugar do menu ou do botão fixo de baixo).
  const endBlurless = blurless();
  // Se o navegador não chegar a desenhar (aba em segundo plano), troca de tela assim mesmo.
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    update();
  };
  const fallback = setTimeout(run, 400);
  const vt = doc.startViewTransition(async () => {
    clearTimeout(fallback);
    run();
    // Dá tempo para o React desenhar a tela nova (e buscar os dados no celular).
    await new Promise((r) => setTimeout(r, 90));
  }) as { ready?: Promise<void>; finished?: Promise<void>; updateCallbackDone?: Promise<void> } | undefined;
  // Uma animação cancelada (ex.: outro toque no meio) não é erro: a tela já trocou.
  vt?.ready?.catch(() => undefined);
  vt?.updateCallbackDone?.catch(() => undefined);
  if (vt?.finished) vt.finished.then(endBlurless, endBlurless);
  else endBlurless();
  setTimeout(endBlurless, 1500); // segurança
}

let blurlessCount = 0;

/** Liga a classe "vt-running" no <html> enquanto houver troca de tela animada; devolve quem a desliga (uma vez só). */
function blurless(): () => void {
  const root = document.documentElement;
  blurlessCount += 1;
  root.classList.add('vt-running');
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    blurlessCount = Math.max(0, blurlessCount - 1);
    if (blurlessCount === 0) setTimeout(() => blurlessCount === 0 && root.classList.remove('vt-running'), 30);
  };
}
