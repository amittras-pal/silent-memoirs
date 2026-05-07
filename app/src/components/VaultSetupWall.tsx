import { useEffect, useState } from 'react';
import { Button, Center, Card, Title, Text, Stack, Alert, CopyButton, PasswordInput, ScrollArea, Textarea, SegmentedControl, useMantineColorScheme } from '@mantine/core';
import logoDark from '../assets/logo-dark.svg';
import logoLight from '../assets/logo-light.svg';
import { GoogleDriveStorage } from '../lib/storage';
import type { VaultUnlockOutcome } from '../lib/vault';
import { VaultManager } from '../lib/vault';
import instructionsText from '../assets/vault-directory-instructions.txt?raw';

interface VaultSetupWallProps {
  storage: GoogleDriveStorage;
  onVaultReady: (vaultManager: VaultManager, unlockOutcome: VaultUnlockOutcome) => void;
  onAuthError: () => void;
}

function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && err.name === 'UnauthorizedError';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred. Please try again.';
}

export function VaultSetupWall({ storage, onVaultReady, onAuthError }: VaultSetupWallProps) {
  const { colorScheme } = useMantineColorScheme();
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [vaultManager] = useState(() => new VaultManager(storage));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockMode, setUnlockMode] = useState<'password' | 'recovery'>('password');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [pendingRecoveryOutcome, setPendingRecoveryOutcome] = useState<VaultUnlockOutcome | null>(null);

  useEffect(() => {
    vaultManager.isVaultInitialized()
      .then(setIsInitialized)
      .catch((err: unknown) => {
        if (isUnauthorizedError(err)) {
          onAuthError();
        } else {
          setError(toErrorMessage(err));
        }
      });
  }, [vaultManager, onAuthError]);

  useEffect(() => {
    if (!isInitialized) {
      setUnlockMode('password');
    }
  }, [isInitialized]);

  const handleCreateVault = async () => {
    if (!password.trim()) {
      setError('Please enter a password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { recoveryKey } = await vaultManager.initializeVault(password);
      setRecoveryKey(recoveryKey);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onAuthError();
        return;
      }
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockVault = async () => {
    if (!password.trim()) {
      setError('Please enter your vault password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const unlockOutcome = await vaultManager.unlockVault(password);
      onVaultReady(vaultManager, unlockOutcome);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onAuthError();
        return;
      }
      const message = toErrorMessage(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryUnlock = async () => {
    if (!recoveryKeyInput.trim()) {
      setError('Please paste your recovery key.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const unlockOutcome = await vaultManager.unlockVaultWithRecoveryKey(recoveryKeyInput);
      setRequiresPasswordReset(true);
      setPendingRecoveryOutcome(unlockOutcome);
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onAuthError();
        return;
      }
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordAfterRecovery = async () => {
    if (!resetPassword.trim()) {
      setError('Please enter a new password.');
      return;
    }

    if (resetPassword !== confirmResetPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await vaultManager.setNewPasswordAfterRecovery(resetPassword);
      setRequiresPasswordReset(false);
      setUnlockMode('password');
      setRecoveryKeyInput('');
      setResetPassword('');
      setConfirmResetPassword('');
      onVaultReady(
        vaultManager,
        pendingRecoveryOutcome ?? {
          method: 'recovery-key',
          slotId: null,
          label: 'Recovery Key',
        },
      );
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onAuthError();
        return;
      }
      setError(toErrorMessage(err));
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
              If you forget your password, this key lets you unlock your vault and set a new password. The application does not store this key anywhere else.
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

            <Button
              onClick={() => onVaultReady(vaultManager, { method: 'password', slotId: null, label: 'Password' })}
              variant="light"
              color="gray"
              mt="md"
            >
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
          <img
            src={colorScheme === 'dark' ? logoDark : logoLight}
            alt="Silent Memoirs"
            style={{ height: 50, width: 'auto', display: 'block' }}
          />
          <Title order={3}>
            {!isInitialized
              ? 'Create New Vault'
              : requiresPasswordReset
                ? 'Set a New Vault Password'
                : unlockMode === 'recovery'
                  ? 'Recover Vault'
                  : 'Vault Found'}
          </Title>
          <Text c="dimmed" ta="center" size="sm">
            {!isInitialized
              ? 'No encrypted vault was found in this Drive space yet. Create a strong password to initialize your vault.'
              : requiresPasswordReset
                ? 'Recovery key verified. For security, you must set a new password before continuing.'
                : unlockMode === 'recovery'
                  ? 'Paste your recovery key to unlock this vault and then immediately set a new password.'
                  : 'Your encrypted vault is stored on Google Drive. Enter your vault password to unlock it.'}
          </Text>

          {error && <Alert color="red" w="100%">{error}</Alert>}

          {!isInitialized && (
            <>
              <PasswordInput
                label="Create Vault Password"
                description="Use a strong password. You will need this password to unlock your vault each time."
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                autoFocus
                w="100%"
              />
              <PasswordInput
                label="Confirm Password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                required
                w="100%"
              />
            </>
          )}

          {isInitialized && !requiresPasswordReset && unlockMode === 'password' && (
            <PasswordInput
              label="Vault Password"
              description="Use the password you set when this vault was created."
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
              autoFocus
              w="100%"
            />
          )}

          {isInitialized && !requiresPasswordReset && unlockMode === 'recovery' && (
            <Textarea
              label="Recovery Key"
              description="Paste the full recovery key exactly as saved."
              placeholder="AGE-SECRET-KEY-..."
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.currentTarget.value)}
              autosize
              minRows={3}
              required
              autoFocus
              w="100%"
            />
          )}

          {isInitialized && requiresPasswordReset && (
            <>
              <PasswordInput
                label="New Password"
                placeholder="Enter new password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.currentTarget.value)}
                required
                autoFocus
                w="100%"
              />
              <PasswordInput
                label="Confirm New Password"
                placeholder="Re-enter new password"
                value={confirmResetPassword}
                onChange={(e) => setConfirmResetPassword(e.currentTarget.value)}
                required
                w="100%"
              />
            </>
          )}

          <Button
            size="lg"
            w="100%"
            onClick={
              !isInitialized
                ? handleCreateVault
                : requiresPasswordReset
                  ? handleResetPasswordAfterRecovery
                  : unlockMode === 'recovery'
                    ? handleRecoveryUnlock
                    : handleUnlockVault
            }
            loading={loading}
          >
            {!isInitialized
              ? 'Create Vault'
              : requiresPasswordReset
                ? 'Set New Password and Continue'
                : unlockMode === 'recovery'
                  ? 'Unlock with Recovery Key'
                  : 'Unlock Vault'}
          </Button>

          {isInitialized && !requiresPasswordReset && (
            <SegmentedControl
              w="100%"
              size="xs"
              color="gray"
              value={unlockMode}
              onChange={(value) => {
                setError('');
                setUnlockMode(value as 'password' | 'recovery');
              }}
              data={[
                { label: 'Password', value: 'password' },
                { label: 'Recovery Key', value: 'recovery' },
              ]}
            />
          )}

          {!isInitialized && (
            <Text size="xs" c="dimmed" ta="center">
              If you lose this password, use your saved recovery key on the unlock screen to regain access.
            </Text>
          )}
        </Stack>
      </Card>
    </Center>
  );
}
