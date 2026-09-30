import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { type NavDir, withTransition } from './lib/nav';
import { DialogProvider } from './components/Dialogs';
import { isTabRoute, TabBar } from './components/Layout';
import { RestTimerProvider } from './components/RestTimer';
import { requestPersistentStorage } from './lib/db';
import { initSync } from './lib/sync';
import { ActiveSession } from './screens/ActiveSession';
import { Body } from './screens/Body';
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

function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
  const tabs = isTabRoute(pathname);
  return (
    <>
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
        <Route path="/progresso/corpo" element={<Body />} />
        <Route path="/progresso/medidas/nova" element={<MeasureForm />} />
        <Route path="/progresso/medidas/:entryId" element={<MeasureForm />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/perfil/nuvem" element={<Cloud />} />
        <Route path="/perfil/configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
          <Shell />
        </RestTimerProvider>
      </DialogProvider>
    </HashRouter>
  );
}
