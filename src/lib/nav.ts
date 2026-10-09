import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const LS_ADDED = 'mt.added';

/**
 * Exercícios entraram no treino pelo seletor: em vez de abrir uma cópia nova da tela do treino
 * (o "voltar" depois caía nessa cópia, ainda em edição), o app volta pelo histórico e deixa este
 * aviso para o treino abrir em edição e rolar até os novos.
 */
export function markAdded(workoutId: string): void {
  try {
    sessionStorage.setItem(LS_ADDED, workoutId);
  } catch {
    // sem armazenamento
  }
}

/** O aviso é deste treino? (Só lê; quem trata o aviso apaga com clearAdded.) */
export function wasAdded(workoutId: string): boolean {
  try {
    return sessionStorage.getItem(LS_ADDED) === workoutId;
  } catch {
    return false;
  }
}

export function clearAdded(): void {
  try {
    sessionStorage.removeItem(LS_ADDED);
  } catch {
    // sem armazenamento
  }
}

/** Quantas telas dá para voltar no histórico do app. */
export function historyDepth(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' ? idx : 0;
}

export type NavDir = 'forward' | 'back' | 'tab' | 'none';

/**
 * Troca de tela pelo código (depois de salvar, excluir, iniciar...) sempre com a animação de deslizar,
 * igual aos links. `go(-1)` volta deslizando para a direita; um endereço entra pela direita, a não ser
 * que `dir: 'back'` diga que é uma volta (ex.: excluir e voltar para a lista).
 */
export function useSlideNavigate(): (to: string | number, opts?: { dir?: NavDir; replace?: boolean }) => void {
  const navigate = useNavigate();
  return useCallback(
    (to, opts = {}) => {
      const dir = opts.dir ?? (typeof to === 'number' && to < 0 ? 'back' : 'forward');
      withTransition(dir, () => {
        if (typeof to === 'number') navigate(to);
        else navigate(to, { replace: opts.replace });
      });
    },
    [navigate],
  );
}

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
  // Um segundo toque no meio da troca (ex.: tocar duas vezes no voltar) é ignorado: voltaria duas telas.
  if (sliding) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    update();
    return;
  }
  document.documentElement.dataset.nav = dir;
  // Durante a animação o vidro fica sem desfoque: nas "fotos" da troca de tela o Safari desenhava
  // o desfoque errado (borrão no lugar do menu ou do botão fixo de baixo).
  const endBlurless = blurless();
  const endSliding = startSliding();
  // Se o navegador não chegar a desenhar (aba em segundo plano), troca de tela assim mesmo.
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    update();
  };
  const fallback = setTimeout(run, 400);
  const fromHash = window.location.hash;
  const fromMain = document.querySelector('main');
  const vt = doc.startViewTransition(async () => {
    clearTimeout(fallback);
    run();
    await screenReady(fromHash, fromMain);
  }) as { ready?: Promise<void>; finished?: Promise<void>; updateCallbackDone?: Promise<void> } | undefined;
  // Uma animação cancelada (ex.: outro toque no meio) não é erro: a tela já trocou.
  vt?.ready?.catch(() => undefined);
  vt?.updateCallbackDone?.catch(() => undefined);
  const end = () => {
    endBlurless();
    endSliding();
  };
  if (vt?.finished) vt.finished.then(end, end);
  else end();
  setTimeout(end, 1500); // segurança
}

/**
 * Espera a tela nova estar desenhada antes de a animação tirar a "foto" dela: o endereço já mudou
 * (no voltar, o iPhone troca de página um pouco depois) e a tela tem conteúdo, não está carregando.
 * Antes eram 90 ms fixos, e no iPhone a foto pegava a tela ainda vazia: a animação mostrava tudo preto.
 * O endereço muda antes de o React desenhar a tela nova, então também espera o <main> antigo sair;
 * senão a "foto" da tela nova era a antiga, e a nova só aparecia de repente no fim.
 */
async function screenReady(fromHash: string, fromMain: Element | null): Promise<void> {
  const start = performance.now();
  for (;;) {
    const elapsed = performance.now() - start;
    if (elapsed > 700) return;
    // Uma troca que não muda o endereço não precisa esperar por isso.
    const moved = window.location.hash !== fromHash || elapsed > 120;
    const main = document.querySelector('main');
    // A mesma tela com outro conteúdo (ex.: outro exercício) pode reaproveitar o <main>.
    const replaced = main !== fromMain || elapsed > 150;
    if (moved && replaced && main && main.childElementCount > 0 && !main.hasAttribute('data-loading')) return;
    await new Promise((r) => setTimeout(r, 16));
  }
}

let sliding = false;

/** Marca que há uma troca de tela animada em andamento; devolve quem desmarca (uma vez só). */
function startSliding(): () => void {
  sliding = true;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    sliding = false;
  };
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

/** Onde cada tela do histórico estava rolada (pela chave da entrada), para voltar no mesmo ponto. */
export const scrollPositions = new Map<string, number>();
