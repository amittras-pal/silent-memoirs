import { createTheme, MantineProvider, type MantineColorsTuple } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { SessionProvider } from './components/SessionManager';
import { AppProvider } from './contexts/AppContext';

const palette: MantineColorsTuple = [
  "#fbf3ef",
  "#f1e4dd",
  "#e5c5b5",
  "#dba589",
  "#d28964",
  "#cd784d",
  "#cb6e40",
  "#b35d32",
  "#a0522b",
  "#693419"
]
const theme = createTheme({
  colors: { "terracotta": palette },
  primaryColor: "terracotta"
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={theme}>
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
