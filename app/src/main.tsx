import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx'
import { SessionProvider } from './components/SessionManager';
import { AppProvider } from './contexts/AppContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <Notifications position="bottom-right" zIndex={9999} />
      <HashRouter>
        <SessionProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </SessionProvider>
      </HashRouter>
    </MantineProvider>
  </StrictMode>,
)
