import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppContext } from '../../contexts/AppContext';
import { getDeviceAuthContext, type DeviceAuthContext } from '../../lib/deviceAuth';
import type { KeyringWebAuthnSlot } from '../../lib/keyring';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getSessionMethodLabel(method: string | null): string {
  if (method === 'webauthn-platform') return 'Device Authenticator';
  if (method === 'recovery-key') return 'Recovery Key';
  if (method === 'password') return 'Password';
  return 'Unknown';
}

export default function SettingsModule() {
  const { vaultManager, currentSessionAuthMethod, currentSessionAuthSlotId } = useAppContext();

  const [deviceContext, setDeviceContext] = useState<DeviceAuthContext | null>(null);
  const [slots, setSlots] = useState<KeyringWebAuthnSlot[]>([]);
  const [recommendedSlotId, setRecommendedSlotId] = useState<string | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canEnroll = useMemo(() => {
    if (!deviceContext) return false;
    return deviceContext.platformAuthenticatorAvailable;
  }, [deviceContext]);

  const refreshSlots = useCallback(async (context: DeviceAuthContext | null) => {
    if (!vaultManager || !context) return;

    const options = await vaultManager.getWebAuthnUnlockOptions(context.deviceId);
    setPlatformAvailable(options.platformAvailable);
    setRecommendedSlotId(options.recommendedSlotId);
    setSlots(options.slots);
  }, [vaultManager]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!vaultManager) return;
      setLoading(true);
      setError('');

      try {
        const context = await getDeviceAuthContext();
        if (cancelled) return;

        setDeviceContext(context);
        await refreshSlots(context);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load vault authentication settings.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshSlots, vaultManager]);

  const handleEnrollPlatformAuthenticator = async () => {
    if (!vaultManager || !deviceContext) return;

    setSaving(true);
    setError('');
    try {
      await vaultManager.addWebAuthnMethod(deviceContext.deviceId, deviceContext.deviceLabel);
      await refreshSlots(deviceContext);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register platform authenticator.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (slotId: string) => {
    if (!vaultManager || !deviceContext) return;

    if (!window.confirm('Remove this authentication method from your vault?')) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await vaultManager.revokeWebAuthnMethod(slotId);
      await refreshSlots(deviceContext);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove authentication method.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Center style={{ flex: 1 }}>
        <Loader variant="dots" />
      </Center>
    );
  }

  return (
    <Stack p="lg" gap="md">
      <Title order={2}>Vault Settings</Title>
      <Text c="dimmed" size="sm">
        Your vault is created with password-first unlock. Add or remove extra authentication methods for this vault below.
      </Text>

      {error && <Alert color="red">{error}</Alert>}

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>Current Session</Title>
          <Group gap="xs">
            <Badge color="indigo" variant="light">{getSessionMethodLabel(currentSessionAuthMethod)}</Badge>
            {currentSessionAuthMethod === 'webauthn-platform' && currentSessionAuthSlotId && (
              <Badge color="teal" variant="light">Active Slot: {currentSessionAuthSlotId.slice(0, 8)}</Badge>
            )}
          </Group>
          {deviceContext && (
            <Text size="sm" c="dimmed">
              Current device: {deviceContext.deviceLabel}
            </Text>
          )}
          <Text size="sm" c="dimmed">
            The active authentication method for this session cannot be revoked until you unlock with a different method.
          </Text>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={4}>Device Authenticator Methods</Title>
            <Button
              onClick={handleEnrollPlatformAuthenticator}
              loading={saving}
              disabled={!canEnroll}
            >
              Add Device Authenticator
            </Button>
          </Group>

          {!platformAvailable && (
            <Alert color="yellow">
              Platform authenticator is not available in this browser/device context. Password and recovery-key unlock remain available.
            </Alert>
          )}

          {slots.length === 0 ? (
            <Text size="sm" c="dimmed">
              No platform authenticators are enrolled yet for this vault.
            </Text>
          ) : (
            <Table highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Label</Table.Th>
                  <Table.Th>Device</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Last Used</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {slots.map((slot) => {
                  const isActiveSessionSlot =
                    currentSessionAuthMethod === 'webauthn-platform' &&
                    currentSessionAuthSlotId === slot.id;
                  const isRecommended = recommendedSlotId === slot.id;

                  return (
                    <Table.Tr key={slot.id}>
                      <Table.Td>{slot.label}</Table.Td>
                      <Table.Td>{slot.deviceId.slice(0, 10)}</Table.Td>
                      <Table.Td>{formatTimestamp(slot.createdAt)}</Table.Td>
                      <Table.Td>{formatTimestamp(slot.lastUsedAt)}</Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          {isActiveSessionSlot && <Badge color="grape" variant="light">Current Session</Badge>}
                          {isRecommended && <Badge color="blue" variant="light">Recommended</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          color="red"
                          variant="light"
                          size="xs"
                          loading={saving}
                          disabled={isActiveSessionSlot}
                          onClick={() => {
                            void handleRevoke(slot.id);
                          }}
                        >
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>Recovery Key Status</Title>
          <Text size="sm" c="dimmed">
            Recovery key unlock is enabled for this vault and remains your break-glass option if you lose password or device authenticator access.
          </Text>
          <Text size="sm" c="dimmed">
            Keep the recovery key offline in a safe location. Do not store it in plain text with your project files.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
