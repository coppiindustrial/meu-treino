import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DialogProvider } from './components/Dialogs';
import { isTabRoute, TabBar } from './components/Layout';
import { RestTimerProvider } from './components/RestTimer';
import { SessionBanner } from './components/SessionBanner';
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
import { Home } from './screens/Home';
import { MeasureForm } from './screens/MeasureForm';
import { NewExercise } from './screens/NewExercise';
import { Profile } from './screens/Profile';
import { ProgramDetail } from './screens/ProgramDetail';
import { Programs } from './screens/Programs';
import { Progress } from './screens/Progress';
import { SessionExercise } from './screens/SessionExercise';
import { Summary } from './screens/Summary';
import { WorkoutDetail } from './screens/WorkoutDetail';

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const tabs = isTabRoute(pathname);
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/treinos" element={<Programs />} />
        <Route path="/ficha/:programId" element={<ProgramDetail />} />
        <Route path="/treino/:workoutId" element={<WorkoutDetail />} />
        <Route path="/treino/:workoutId/adicionar" element={<ExercisePicker mode="workout" />} />
        <Route path="/exercicios" element={<ExercisePicker mode="browse" />} />
        <Route path="/exercicios/novo" element={<NewExercise />} />
        <Route path="/exercicios/:exerciseId/editar" element={<NewExercise />} />
        <Route path="/exercicio/:exerciseId" element={<ExerciseDetail />} />
        <Route path="/sessao" element={<ActiveSession />} />
        <Route path="/sessao/adicionar" element={<ExercisePicker mode="session" />} />
        <Route path="/sessao/item/:itemId" element={<SessionExercise />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {tabs && <SessionBanner />}
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
