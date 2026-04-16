import { useState } from 'react';
import { ActionIcon, Code, CopyButton, Modal, ScrollArea, Tooltip } from '@mantine/core';
import { IconBug, IconCheck, IconCopy } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

import { useAppContext } from '../contexts/AppContext';

export function DebugManifestButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const { syncEngine } = useAppContext();
  const [manifestData, setManifestData] = useState<string>('Loading...');

  const handleOpen = async () => {
    open();
    if (!syncEngine) {
      setManifestData('SyncEngine not initialized.');
      return;
    }
    
    try {
      const manifest = await syncEngine.getRawManifest();
      setManifestData(JSON.stringify(manifest, null, 2));
    } catch (e: any) {
      setManifestData(`Error loading manifest: ${e.message}`);
    }
  };

  return (
    <>
      <Tooltip label="Debug Manifest">
        <ActionIcon onClick={handleOpen} variant="default" size="lg" radius="md">
          <IconBug size={20} stroke={1.5} />
        </ActionIcon>
      </Tooltip>

      <Modal 
        opened={opened} 
        onClose={close} 
        title="Raw Manifest.age State" 
        size="xl"
      >
        <div style={{ position: 'relative' }}>
            <ScrollArea h={500} type="always" offsetScrollbars bg="var(--mantine-color-dark-8)" p="xs" style={{ borderRadius: '4px' }}>
                <Code block>{manifestData}</Code>
            </ScrollArea>
            <div style={{ position: 'absolute', top: 10, right: 20 }}>
                <CopyButton value={manifestData} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                    <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                    </Tooltip>
                )}
                </CopyButton>
            </div>
        </div>
      </Modal>
    </>
  );
}
