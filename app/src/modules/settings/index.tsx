import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';

import { useAppContext } from '../../contexts/AppContext';

export default function SettingsModule() {
  const { syncEngine, triggerManifestRepair } = useAppContext();

  const [rebuilding, setRebuilding] = useState(false);

  const handleRebuildManifest = async () => {
    if (!syncEngine || rebuilding) return;
    setRebuilding(true);
    try {
      await triggerManifestRepair();
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <Stack p="lg" gap="md">
      <Title order={2}>Vault Settings</Title>

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>Rebuild Manifest</Title>
          <Text size="sm" c="dimmed">
            If your entries list appears incomplete or out of sync, you can rebuild the manifest by scanning all entries in your vault. This will discard the current manifest and re-read every entry from Drive.
          </Text>
          <Text size="sm" c="dimmed">
            This operation may take a while depending on the number of entries in your vault.
          </Text>
          <Group>
            <Button
              onClick={handleRebuildManifest}
              loading={rebuilding}
              disabled={!syncEngine}
            >
              Rebuild Manifest
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
