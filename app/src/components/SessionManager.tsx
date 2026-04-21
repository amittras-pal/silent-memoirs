import { Button, Modal, Stack, Text, Title } from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cacheGoogleUserProfile,
  fetchGoogleUserProfile,
  GOOGLE_OAUTH_SCOPE,
  GOOGLE_TOKEN_ISSUED_EVENT,
  notifyGoogleTokenIssued,
} from '../lib/googleAuth';

declare global {
  interface Window {
    google?: any;
  }
}

// Token lifetime is typically 60 mins. We target refreshing at 50 mins.
export const SESSION_REFRESH_TARGET_MS = 50 * 60 * 1000;

interface SessionContextType {
  triggerRefresh: (silent: boolean) => Promise<string>;
  tokenIssuedAt: number | null;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function useSessionManager() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSessionManager must be used within SessionProvider');
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [modalOpened, setModalOpened] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [tokenIssuedAt, setTokenIssuedAt] = useState<number | null>(() => {
    const val = localStorage.getItem('token_issued_at');
    return val ? parseInt(val, 10) : null;
  });

  const resolveQueueRef = useRef<Array<{resolve: (token: string) => void, reject: (err: any) => void}>>([]);

  const getClientId = () => {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || 'REQUIRE_SETUP.apps.googleusercontent.com';
  };

  const attemptRawRefresh = (silent: boolean): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error("Google Identity Services script not loaded"));
          return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: GOOGLE_OAUTH_SCOPE,
          prompt: silent ? '' : 'consent', 
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              reject(new Error(tokenResponse.error));
              return;
            }
            if (tokenResponse.access_token) {
              const now = Date.now();
              localStorage.setItem('google_access_token', tokenResponse.access_token);
              localStorage.setItem('token_issued_at', now.toString());
              setTokenIssuedAt(now);

              notifyGoogleTokenIssued(now);
              try {
                const profile = await fetchGoogleUserProfile(tokenResponse.access_token);
                cacheGoogleUserProfile(profile);
              } catch (error) {
                console.warn('Unable to refresh Google user profile.', error);
              }

              resolve(tokenResponse.access_token);
            } else {
              reject(new Error("No access token returned"));
            }
          },
        });
        
        client.requestAccessToken({ prompt: silent ? '' : 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  };

  const flushQueue = (err: any, token?: string) => {
    resolveQueueRef.current.forEach(({ resolve, reject }) => {
      if (err) reject(err);
      else if (token) resolve(token);
    });
    resolveQueueRef.current = [];
    setModalOpened(false);
    setIsRefreshing(false);
  };

  const executeRefreshFlow = async (silent: boolean) => {
    setIsRefreshing(true);
    if (silent) {
      try {
        const token = await attemptRawRefresh(true);
        flushQueue(null, token);
        return;
      } catch (e: any) {
        console.warn("Silent refresh failed, requiring user interaction:", e);
      }
    }
    // Fallthrough: Open modal and wait for manual interaction
    setModalOpened(true);
  };

  const triggerRefresh = (silent: boolean): Promise<string> => {
    const promise = new Promise<string>((resolve, reject) => {
      resolveQueueRef.current.push({ resolve, reject });
    });

    if (resolveQueueRef.current.length === 1) {
      executeRefreshFlow(silent);
    }

    return promise;
  };

  const handleManualReconnect = async () => {
    try {
      const token = await attemptRawRefresh(false);
      flushQueue(null, token);
    } catch (e) {
      console.error("Manual reconnect failed", e);
    }
  };

  // Pre-emptive check loop
  useEffect(() => {
    if (!tokenIssuedAt) return;

    const interval = setInterval(() => {
      const timeSinceIssue = Date.now() - tokenIssuedAt;
      if (timeSinceIssue >= SESSION_REFRESH_TARGET_MS) {
        if (resolveQueueRef.current.length === 0) {
           // We are at the 50-minute mark and no refresh is actively running.
           // Trigger a silent refresh pre-emptively.
           triggerRefresh(true).catch(e => console.error("Auto pre-emptive refresh failed", e));
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [tokenIssuedAt]);

  // Update tokenIssuedAt on local storage change (e.g. from AuthWall initial login)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'token_issued_at' && e.newValue) {
        setTokenIssuedAt(parseInt(e.newValue, 10));
      } else if (e.key === 'token_issued_at' && !e.newValue) {
        setTokenIssuedAt(null);
      }
    };

    const handleTokenIssued = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      if (typeof customEvent.detail === 'number') {
        setTokenIssuedAt(customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(GOOGLE_TOKEN_ISSUED_EVENT, handleTokenIssued as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(GOOGLE_TOKEN_ISSUED_EVENT, handleTokenIssued as EventListener);
    };
  }, []);

  return (
    <SessionContext.Provider value={{ triggerRefresh, tokenIssuedAt }}>
      {children}

      <Modal
        opened={modalOpened}
        onClose={() => {}}
        centered
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        title={<Title order={4} c="red.6">Session Re-authentication Required</Title>}
      >
        <Stack gap="md" py="xs">
          <Text size="sm">
            Due to privacy and browser policies, we could not silently renew your Google Drive connection. 
            Your current sync operation has been paused.
          </Text>
          <Text size="sm" fw={500}>
            Please explicitly reconnect to resume smoothly. Your unsaved entry text is safe and will automatically sync once authorized.
          </Text>
          <Button 
            className="mt-4"
            size="md" 
            variant="filled" 
            color="red.7"
            leftSection={<IconBrandGoogle size={20} />}
            loading={isRefreshing && !modalOpened}
            onClick={handleManualReconnect}
          >
            Reconnect Google Drive
          </Button>
        </Stack>
      </Modal>
    </SessionContext.Provider>
  );
}
