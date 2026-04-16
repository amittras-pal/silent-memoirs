import { Modal, Button, Text, NavLink, Group, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout } from '@tabler/icons-react';

interface LogoutButtonProps {
  onLogout: () => void;
  isDirty: boolean;
  isSaving: boolean;
}

export function LogoutButton({ onLogout, isDirty, isSaving }: LogoutButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Tooltip 
        label={isSaving ? "Sync in progress..." : "Logout & Disconnect"} 
        position="right" 
        openDelay={500}
      >
        <NavLink
          label={<Text size="sm">Logout</Text>}
          color="red"
          style={{ borderRadius: '0.5rem' }}
          leftSection={<IconLogout size={16} stroke={1.5} />}
          onClick={open}
          disabled={isSaving}
        />
      </Tooltip>

      <Modal opened={opened} onClose={close} title="Confirm Logout" centered>
        <Text size="sm" mb="lg">
          {isDirty 
            ? "You have unsaved changes. If you log out now, your unsaved text and staged media will be lost. Are you sure you want to disconnect?"
            : "Are you sure you want to log out and disconnect your session?"}
        </Text>
        
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button color="red" onClick={() => {
            close();
            onLogout();
          }}>
            Logout & Disconnect
          </Button>
        </Group>
      </Modal>
    </>
  );
}
