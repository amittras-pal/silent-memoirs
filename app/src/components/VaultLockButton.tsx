import { Kbd, NavLink, Tooltip, Group, Text } from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconLock } from '@tabler/icons-react';

interface VaultLockButtonProps {
  onLock: () => void;
}

export function VaultLockButton({ onLock }: VaultLockButtonProps) {
  useHotkeys([
    ['mod+shift+L', onLock],
  ]);

  const os = useOs();
  const isMac = os === 'macos';
  const shortcutText = isMac ? '⌘ + Shift + L' : 'Ctrl + Shift + L';

  return (
    <Tooltip label={`Lock vault securely (${shortcutText})`} position="right" openDelay={500}>
      <NavLink
        label={
          <Group justify="space-between">
            <Text size="sm">Lock Vault</Text>
            <Kbd size="xs">{isMac ? '⌘⇧L' : 'Ctrl+Shift+L'}</Kbd>
          </Group>
        }
        style={{ borderRadius: '0.5rem' }}
        leftSection={<IconLock size={16} stroke={1.5} />}
        onClick={onLock}
      />
    </Tooltip>
  );
}
