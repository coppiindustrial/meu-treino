export type NavDir = 'forward' | 'back' | 'tab';

type DocWithVT = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => unknown;
};

/**
 * Troca de tela com animação (View Transitions). A tela antiga fica "congelada"
 * enquanto a nova carrega os dados, e então desliza. Sem suporte, troca na hora.
 */
export function withTransition(dir: NavDir, update: () => void): void {
  const doc = document as DocWithVT;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    update();
    return;
  }
  document.documentElement.dataset.nav = dir;
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
  vt?.finished?.catch(() => undefined);
  vt?.updateCallbackDone?.catch(() => undefined);
}
