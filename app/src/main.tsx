import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx'
import { SessionProvider } from './components/SessionManager';
import { AppProvider } from './contexts/AppContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <BrowserRouter>
        <SessionProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </SessionProvider>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
