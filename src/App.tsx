import { useEffect, useLayoutEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { type NavDir, withTransition } from './lib/nav';
import { DialogProvider } from './components/Dialogs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isTabRoute, TabBar } from './components/Layout';
import { CardioTimerProvider } from './components/CardioTimer';
import { RestTimerProvider } from './components/RestTimer';
import { requestPersistentStorage } from './lib/db';
import { initSync } from './lib/sync';
import { ActiveSession } from './screens/ActiveSession';
import { Calendar } from './screens/Calendar';
import { Cloud } from './screens/Cloud';
import { DayEdit } from './screens/DayEdit';
import { ExerciseDetail } from './screens/ExerciseDetail';
import { ExercisePicker } from './screens/ExercisePicker';
import { History } from './screens/History';
import { ImportProgram } from './screens/ImportProgram';
import { Home } from './screens/Home';
import { MeasureForm } from './screens/MeasureForm';
import { NewExercise } from './screens/NewExercise';
import { Profile } from './screens/Profile';
import { ProgramDetail } from './screens/ProgramDetail';
import { ReorderProgram } from './screens/ReorderProgram';
import { ReorderWorkout } from './screens/ReorderWorkout';
import { Programs } from './screens/Programs';
import { Settings } from './screens/Settings';
import { Progress } from './screens/Progress';
import { Summary } from './screens/Summary';
import { WorkoutDetail } from './screens/WorkoutDetail';

// O próprio app cuida da rolagem (topo nas telas novas, mesmo ponto ao voltar); sem isto o Safari
// restaurava a rolagem antiga no meio da animação de voltar.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

/** Onde cada tela do histórico estava rolada (pela chave da entrada), para voltar no mesmo ponto. */
const scrollPositions = new Map<string, number>();

/** Volta a rolagem para `y`. A tela carrega os dados depois, então espera ela crescer (até ~1 s). */
function restoreScroll(y: number): () => void {
  let frame = 0;
  const start = performance.now();
  const tick = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y - 1 || performance.now() - start > 1000) {
      window.scrollTo(0, Math.min(y, Math.max(0, max)));
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(frame);
}

function Shell() {
  const location = useLocation();
  const { pathname } = location;
  const navType = useNavigationType();
  const navigate = useNavigate();

  // Guarda a rolagem da tela atual enquanto ela rola.
  const scrollKey = useRef(location.key);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scrollPositions.set(scrollKey.current, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Voltar (ex.: da tela do exercício para a lista) reabre no mesmo ponto; tela nova abre no topo.
  // Trocas dentro da mesma tela (abas no endereço, editar) não mexem na rolagem.
  const lastPath = useRef(pathname);
  useLayoutEffect(() => {
    const samePath = lastPath.current === pathname;
    lastPath.current = pathname;
    scrollKey.current = location.key;
    const saved = scrollPositions.get(location.key);
    if (navType === 'POP' && saved !== undefined) return restoreScroll(saved);
    if (!samePath) window.scrollTo(0, 0);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Todos os links internos trocam de tela com animação (deslizar ou fade nas abas).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
      if (!a || a.target) return;
      // Soltar o dedo depois de deslizar uma linha (ou tocar nela aberta) não abre o link dela.
      if (a.closest('.swipe-wrap.dragging, .swipe-wrap.open, [data-drag-lock]')) return;
      const to = a.getAttribute('href')!.slice(1);
      e.preventDefault();
      e.stopPropagation();
      if (to === (window.location.hash.slice(1) || '/')) return;
      const dir = (a.dataset.nav as NavDir | undefined) ?? (a.closest('.tabbar') ? 'tab' : 'forward');
      withTransition(dir, () => navigate(to, { replace: a.dataset.replace !== undefined }));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
  // Cabeçalhos fixos: a linha fina embaixo deles só aparece depois de rolar a tela.
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.classList.toggle('rolou', window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabs = isTabRoute(pathname);
  return (
    <>
      {/* A chave pelo endereço faz a tela de erro sumir ao trocar de tela. */}
      <ErrorBoundary key={pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/treinos" element={<Programs />} />
        <Route path="/treinos/colar" element={<ImportProgram />} />
        <Route path="/ficha/:programId" element={<ProgramDetail />} />
        <Route path="/ficha/:programId/reordenar" element={<ReorderProgram />} />
        <Route path="/treino/:workoutId" element={<WorkoutDetail />} />
        <Route path="/treino/:workoutId/adicionar" element={<ExercisePicker mode="workout" />} />
        <Route path="/treino/:workoutId/reordenar" element={<ReorderWorkout />} />
        <Route path="/treino/:workoutId/substituir/:itemId" element={<ExercisePicker mode="replace" />} />
        <Route path="/exercicios" element={<ExercisePicker mode="browse" />} />
        <Route path="/exercicios/novo" element={<NewExercise />} />
        <Route path="/exercicios/:exerciseId/editar" element={<NewExercise />} />
        <Route path="/exercicio/:exerciseId" element={<ExerciseDetail />} />
        <Route path="/sessao" element={<ActiveSession />} />
        <Route path="/sessao/adicionar" element={<ExercisePicker mode="session" />} />
        <Route path="/sessao/item/:itemId" element={<Navigate to="/sessao" replace />} />
        <Route path="/sessao/:sessionId/resumo" element={<Summary />} />
        <Route path="/calendario" element={<Calendar />} />
        <Route path="/historico" element={<History />} />
        <Route path="/dia/novo" element={<DayEdit />} />
        <Route path="/dia/:sessionId" element={<DayEdit />} />
        <Route path="/progresso" element={<Progress />} />
        <Route path="/progresso/corpo" element={<Navigate to="/progresso?aba=corpo" replace />} />
        <Route path="/progresso/medidas/nova" element={<MeasureForm />} />
        <Route path="/progresso/medidas/:entryId" element={<MeasureForm />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/perfil/nuvem" element={<Cloud />} />
        <Route path="/perfil/configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
      {tabs && <TabBar pathname={pathname} />}
    </>
  );
}

export function App() {
  useEffect(() => {
    void requestPersistentStorage();
    void initSync();
  }, []);
  return (
    <HashRouter>
      <DialogProvider>
        <RestTimerProvider>
          <CardioTimerProvider>
            <Shell />
          </CardioTimerProvider>
        </RestTimerProvider>
      </DialogProvider>
    </HashRouter>
  );
}
