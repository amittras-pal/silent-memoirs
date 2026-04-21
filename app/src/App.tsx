import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import '@mantine/dates/styles.css';

import { AuthWall } from './components/AuthWall';
import { VaultSetupWall } from './components/VaultSetupWall';
import { ProtectedLayout } from './components/ProtectedLayout';
import { ROUTES } from './lib/routes';
import { useAppContext } from './contexts/AppContext';
import type { VaultManager, VaultUnlockOutcome } from './lib/vault';

const EditorModule = lazy(() => import('./modules/editor'));
const EntriesModule = lazy(() => import('./modules/entries'));
const ViewerModule = lazy(() => import('./modules/viewer'));
const SettingsModule = lazy(() => import('./modules/settings'));

export default function App() {
  const {
    storage,
    vaultManager,
    handleLogout,
    setVaultManager,
    setStorage,
    getResumeRoute,
    setSessionAuthContext,
  } = useAppContext();

  const handleVaultReady = (manager: VaultManager, unlockOutcome: VaultUnlockOutcome) => {
    setVaultManager(manager);
    setSessionAuthContext(unlockOutcome.method, unlockOutcome.slotId);
  };

  return (
    <Routes>
      <Route
        path={ROUTES.login}
        element={
          storage ? (
            <Navigate to={vaultManager ? getResumeRoute() : ROUTES.unlock} replace />
          ) : (
            <AuthWall onAuthenticated={setStorage} />
          )
        }
      />
      <Route
        path={ROUTES.unlock}
        element={
          !storage ? (
            <Navigate to={ROUTES.login} replace />
          ) : vaultManager ? (
            <Navigate to={getResumeRoute()} replace />
          ) : (
            <VaultSetupWall storage={storage} onVaultReady={handleVaultReady} onAuthError={handleLogout} />
          )
        }
      />
      <Route element={<ProtectedLayout />}>
        <Route path={ROUTES.editor} element={<EditorModule />} />
        <Route path={ROUTES.entries} element={<EntriesModule />} />
        <Route path={ROUTES.viewer} element={<ViewerModule />} />
        <Route path={ROUTES.settings} element={<SettingsModule />} />
      </Route>
      <Route path="/" element={<Navigate to={ROUTES.editor} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.editor} replace />} />
    </Routes>
  );
}
