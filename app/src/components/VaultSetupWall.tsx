import { useEffect, useState } from 'react';
import { Button, Center, Card, Title, Text, Stack, Alert, CopyButton, PasswordInput, ScrollArea } from '@mantine/core';
import { GoogleDriveStorage } from '../lib/storage';
import { VaultManager } from '../lib/vault';
import instructionsText from '../assets/vault-directory-instructions.txt?raw';

interface VaultSetupWallProps {
  storage: GoogleDriveStorage;
  onVaultReady: (vaultManager: VaultManager) => void;
  onAuthError: () => void;
}

export function VaultSetupWall({ storage, onVaultReady, onAuthError }: VaultSetupWallProps) {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [vaultManager] = useState(() => new VaultManager(storage));
  
  const [usePasswordFallback, setUsePasswordFallback] = useState(false);
  const [fallbackPassword, setFallbackPassword] = useState('');

  useEffect(() => {
    vaultManager.isVaultInitialized()
      .then(setIsInitialized)
      .catch((e: any) => {
        if (e.name === 'UnauthorizedError') {
          onAuthError();
        } else {
          setError(e.message);
        }
      });
  }, [vaultManager, onAuthError]);

  const handleCreateVault = async () => {
    if (usePasswordFallback && !fallbackPassword) return setError("Please enter a password.");
    setLoading(true);
    setError('');
    try {
      const { recoveryKey } = await vaultManager.initializeVault(usePasswordFallback ? fallbackPassword : undefined);
      setRecoveryKey(recoveryKey);
    } catch (err: any) {
      if (err.name === 'UnauthorizedError') {
        onAuthError();
        return;
      }
      setError(err.message);
      if (err.message.includes('PRF')) setUsePasswordFallback(true);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockVault = async () => {
    if (usePasswordFallback && !fallbackPassword) return setError("Please enter a password.");
    setLoading(true);
    setError('');
    try {
      await vaultManager.unlockVault(usePasswordFallback ? fallbackPassword : undefined);
      onVaultReady(vaultManager);
    } catch (err: any) {
      if (err.name === 'UnauthorizedError') {
        onAuthError();
        return;
      }
      setError(err.message);
      if (err.message.includes('PRF')) setUsePasswordFallback(true);
    } finally {
      setLoading(false);
    }
  };

  if (isInitialized === null) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text>Checking vault status...</Text>
      </Center>
    );
  }

  // Once recovery key is generated, pause and force the user to save it.
  if (recoveryKey) {
    return (
      <Center style={{ height: '100vh', backgroundColor: 'var(--mantine-color-body)' }}>
        <Card shadow="xl" p="xl" radius="md" withBorder style={{ maxWidth: 700, width: '100%' }}>
          <Stack align="stretch" gap="md">
            <Title order={3}>Save Your Recovery Key</Title>
            <Alert color="red" title="Warning">
              If you lose your WebAuthn authenticator (e.g., your device breaks), this is the ONLY way to recover your data. The application does not store this key anywhere else.
            </Alert>
            <Text size="sm" style={{ wordBreak: 'break-all', fontFamily: 'monospace', padding: '1rem', background: 'var(--mantine-color-dark-8)', borderRadius: '4px' }}>
              {recoveryKey}
            </Text>
            <CopyButton value={recoveryKey}>
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? 'Copied' : 'Copy to Clipboard'}
                </Button>
              )}
            </CopyButton>

            <Title order={5} mt="md">Vault Rules & Instructions</Title>
            <Text size="sm" c="dimmed" mt="-sm">
              Please read carefully. A copy of these instructions is deposited in your Google Drive folder for future reference.
            </Text>
            <ScrollArea h={200} type="always" offsetScrollbars style={{ background: 'var(--mantine-color-dark-8)', borderRadius: '4px', padding: '1rem' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {instructionsText}
              </pre>
            </ScrollArea>

            <Button onClick={() => onVaultReady(vaultManager)} variant="light" color="gray" mt="md">
              I understand and have saved the key. Proceed.
            </Button>
          </Stack>
        </Card>
      </Center>
    );
  }

  return (
    <Center style={{ height: '100vh', backgroundColor: 'var(--mantine-color-body)' }}>
      <Card shadow="xl" p="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
        <Stack align="center" gap="md">
          <Title order={3}>{isInitialized ? 'Vault Found' : 'Create New Vault'}</Title>
          <Text c="dimmed" ta="center" size="sm">
            {isInitialized 
              ? 'Your cryptographic vault is stored securely on your Google Drive. We need your authenticator to unlock it.' 
              : 'It looks like you do not have an encrypted vault here yet. Let\'s create one using your biometric authenticator.'}
          </Text>
          
          {error && <Alert color="red" w="100%">{error}</Alert>}

          {usePasswordFallback && (
            <PasswordInput
              label="Fallback Password"
              description="Your device does not support the WebAuthn PRF extension. Please create a strong password to manually derive your encryption keys."
              placeholder="Enter a strong password"
              value={fallbackPassword}
              onChange={(e) => setFallbackPassword(e.currentTarget.value)}
              required
              autoFocus
              w="100%"
            />
          )}

          <Button 
            size="lg" 
            w="100%"
            onClick={isInitialized ? handleUnlockVault : handleCreateVault} 
            loading={loading}
            variant="gradient"
            gradient={{ from: 'indigo', to: 'cyan' }}
          >
            {isInitialized 
              ? (usePasswordFallback ? 'Unlock with Password' : 'Unlock Vault') 
              : (usePasswordFallback ? 'Create Vault with Password' : 'Create Secure Vault')}
          </Button>
          
          {!usePasswordFallback && (
            <Button variant="transparent" size="xs" color="gray" onClick={() => setUsePasswordFallback(true)}>
              Use manual password instead
            </Button>
          )}
        </Stack>
      </Card>
    </Center>
  );
}
