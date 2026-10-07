import '@fontsource-variable/inter';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { installTouchFeedback } from './lib/touch';

// Efeito de pressionar e vibração leve nos botões.
installTouchFeedback();

// Sem zoom com dois dedos: o Safari do iPhone ignora o "user-scalable=no" da página, então o gesto é cancelado aqui.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1 && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

// Ao sair do app, nenhum campo fica ativo: o iPhone só oferece "Desfazer digitação" (ao sacudir) quando
// há um campo com foco, inclusive o campo escondido que as roletas usam para o teclado.
const releaseFocus = () => {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable]')) el.blur();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') releaseFocus();
});
window.addEventListener('pagehide', releaseFocus);

// Procura versão nova ao abrir, ao voltar para o app e a cada hora.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
