import { Modal, Button, Text, Group, Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

interface ExportWarningModalProps {
  opened: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExportWarningModal({ opened, onConfirm, onCancel }: ExportWarningModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="Export to PDF"
      centered
    >
      <Alert
        icon={<IconAlertTriangle size={18} />}
        color="orange"
        variant="light"
        mb="md"
      >
        The exported PDF will be <b>unencrypted</b>. Anyone with access to
        the file will be able to read your journal content and view embedded
        images.
      </Alert>
      <Text size="sm" c="dimmed" mb="lg">
        Please do not close this tab while the export is in progress.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button color="orange" onClick={onConfirm}>
          Export
        </Button>
      </Group>
    </Modal>
  );
}
