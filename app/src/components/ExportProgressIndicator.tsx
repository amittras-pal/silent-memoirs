import { ActionIcon, Group, Paper, Progress, Text, Tooltip, Transition } from '@mantine/core';
import { IconX, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import type { ExportJobState } from '../lib/export/exportTypes';
import { useEffect, useState } from 'react';

interface ExportProgressIndicatorProps {
  state: ExportJobState;
  onCancel: () => void;
  onDismiss: () => void;
}

export function ExportProgressIndicator({ state, onCancel, onDismiss }: ExportProgressIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const isRunning = state.status === 'running';
  const isDone = state.status === 'done';
  const isFailed = state.status === 'failed';
  const showIndicator = isRunning || isDone || isFailed;

  useEffect(() => {
    setVisible(showIndicator);
  }, [showIndicator]);

  // Auto-dismiss after completion
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isDone, onDismiss]);

  const progressColor = isFailed ? 'red' : isDone ? 'green' : 'blue';

  return (
    <Transition mounted={visible} transition="slide-up" duration={300}>
      {(styles) => (
        <Paper
          shadow="lg"
          p="sm"
          radius="md"
          withBorder
          style={{
            ...styles,
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 10000,
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Group justify="space-between" align="center" mb={4} wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              {isDone && <IconCheck size={16} color="var(--mantine-color-green-6)" />}
              {isFailed && <IconAlertCircle size={16} color="var(--mantine-color-red-6)" />}
              <Text size="sm" fw={600} lineClamp={1}>
                {isRunning && 'Exporting PDF…'}
                {isDone && (state.filename ?? 'Export complete')}
                {isFailed && 'Export failed'}
              </Text>
            </Group>

            {isRunning && (
              <Tooltip label="Cancel export" withArrow>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={onCancel}>
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {(isDone || isFailed) && (
              <Tooltip label="Dismiss" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={onDismiss}>
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {isRunning && (
            <>
              <Progress
                value={state.percent ?? 0}
                color={progressColor}
                size="sm"
                radius="xl"
                mb={4}
                animated
              />
              <Text size="xs" c="dimmed" lineClamp={1}>
                {state.stageText ?? 'Processing…'}
              </Text>
            </>
          )}

          {isDone && state.warnings && state.warnings.length > 0 && (
            <Text size="xs" c="orange" mt={4}>
              {state.warnings.length} warning{state.warnings.length > 1 ? 's' : ''} during export
            </Text>
          )}

          {isFailed && state.error && (
            <Text size="xs" c="red" mt={4} lineClamp={2}>
              {state.error}
            </Text>
          )}
        </Paper>
      )}
    </Transition>
  );
}
