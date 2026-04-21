import { Button, Card, Center, Stack, Text, Title } from '@mantine/core';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import {
  cacheGoogleUserProfile,
  clearCachedGoogleUserProfile,
  fetchGoogleUserProfile,
  GOOGLE_OAUTH_SCOPE,
  loadCachedGoogleUserProfile,
  notifyGoogleTokenIssued,
} from '../lib/googleAuth';
import { GoogleDriveStorage } from '../lib/storage';

export function clearCachedGoogleToken() {
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('token_issued_at');
  clearCachedGoogleUserProfile();
}

interface AuthWallProps {
  onAuthenticated: (storage: GoogleDriveStorage) => void;
}

function LoginButton({ onAuthenticated }: AuthWallProps) {
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    scope: GOOGLE_OAUTH_SCOPE,
    onSuccess: async (tokenResponse) => {
      setLoading(true);

      localStorage.setItem('google_access_token', tokenResponse.access_token);
      const issuedAt = Date.now();
      localStorage.setItem('token_issued_at', issuedAt.toString());
      notifyGoogleTokenIssued(issuedAt);

      try {
        const profile = await fetchGoogleUserProfile(tokenResponse.access_token);
        cacheGoogleUserProfile(profile);
      } catch (error) {
        console.warn('Unable to fetch Google user profile during login.', error);
      }

      const storage = new GoogleDriveStorage(tokenResponse.access_token);
      onAuthenticated(storage);
    },
    onError: () => {
      console.error('Login Failed');
      setLoading(false);
    },
  });

  return (
    <Button 
      size="lg" 
      onClick={() => login()} 
      loading={loading}
      variant="gradient"
      gradient={{ from: 'indigo', to: 'cyan' }}
    >
      Connect Google Drive
    </Button>
  );
}

export function AuthWall({ onAuthenticated }: AuthWallProps) {
  // In a real production app, this Client ID should be loaded from env vars.
  // Using a placeholder for development plan scaffolding.
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'REQUIRE_SETUP.apps.googleusercontent.com';

  useEffect(() => {
    const cachedToken = localStorage.getItem('google_access_token');
    
    if (cachedToken) {
      const storage = new GoogleDriveStorage(cachedToken);
      onAuthenticated(storage);

      if (!loadCachedGoogleUserProfile()) {
        void fetchGoogleUserProfile(cachedToken)
          .then((profile) => {
            cacheGoogleUserProfile(profile);
          })
          .catch((error) => {
            console.warn('Unable to fetch Google user profile from cached token.', error);
          });
      }
    }
  }, [onAuthenticated]);

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <Center style={{ height: '100vh', backgroundColor: 'var(--mantine-color-body)' }}>
        <Card shadow="xl" p="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
          <Stack align="center" gap="md">
            <Title order={2} style={{ letterSpacing: '1px' }}>Silent Memoirs</Title>
            <Text c="dimmed" ta="center" size="sm" mb="lg">
              Your journal is entirely local-first. Connect your Google Drive to enable encrypted synchronization.
            </Text>
            <LoginButton onAuthenticated={onAuthenticated} />
          </Stack>
        </Card>
      </Center>
    </GoogleOAuthProvider>
  );
}
