import { ActionIcon, AppShell, Burger, Button, Center, Flex, Group, Loader, Modal, NavLink, ScrollArea, Text, TextInput, Tooltip, useMantineColorScheme } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { Editor } from './components/Editor';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IconDeviceFloppy, IconLogout, IconMoon, IconPlus, IconSun, IconX } from '@tabler/icons-react';
import { AuthWall, clearCachedGoogleToken } from './components/AuthWall';
import { VaultSetupWall } from './components/VaultSetupWall';
import { type GoogleDriveStorage, type JournalEntry, UnauthorizedError } from './lib/storage';
import { SyncEngine } from './lib/sync';
import { VaultManager } from './lib/vault';

import '@mantine/dates/styles.css';

export default function App() {
  const [opened, { toggle }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  
  // App state
  const [storage, setStorage] = useState<GoogleDriveStorage | null>(null);
  const [vaultManager, setVaultManager] = useState<VaultManager | null>(null);
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  
  // Data state
  const [years, setYears] = useState<string[]>([]);
  const [entriesByYear, setEntriesByYear] = useState<Record<string, string[]>>({});
  const [activeEntryPath, setActiveEntryPath] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  
  // Edit State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorDate, setEditorDate] = useState<string>('');
  
  // Track dirty state
  const [initialEditorTitle, setInitialEditorTitle] = useState('');
  const [initialEditorContent, setInitialEditorContent] = useState<string>('');
  const [initialEditorDate, setInitialEditorDate] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);

  // Modal State
  const [newEntryModalOpened, { open: openNewEntryModal, close: closeNewEntryModal }] = useDisclosure(false);
  const [newEntryDate, setNewEntryDate] = useState<Date | null>(new Date());
  const isNewEntryRef = useRef(false);
  
  // Inactivity & Lock State
  const [lastActive, setLastActive] = useState<number>(Date.now());
  const [inactivityModalOpened, { open: openInactivityModal, close: closeInactivityModal }] = useDisclosure(false);
  const [countdown, setCountdown] = useState(30);

  const isDirty = activeEntryPath !== null && (
    editorTitle !== initialEditorTitle ||
    editorContent !== initialEditorContent ||
    editorDate !== initialEditorDate
  );

  // Before unload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Inactivity tracking
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const throttledUpdate = () => {
      if (!timeout) {
        setLastActive(Date.now());
        timeout = setTimeout(() => {
          timeout = null;
        }, 1000);
      }
    };

    const listeners = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    listeners.forEach(event => window.addEventListener(event, throttledUpdate, { passive: true }));

    return () => {
      listeners.forEach(event => window.removeEventListener(event, throttledUpdate));
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const handleLockVault = () => {
    setVaultManager(null);
    setSyncEngine(null);
    // Deliberately NOT clearing activeEntryPath, editorTitle, etc.
    // This perfectly preserves the unsaved workspace when unlocking later.
    closeInactivityModal();
  };

  useEffect(() => {
    if (!vaultManager) return; // Only track if unlocked

    const interval = setInterval(() => {
      const idleTime = Date.now() - lastActive;
      
      // 10 minutes total timeout. Show modal at 9m 30s.
      if (idleTime >= 9.5 * 60 * 1000 && idleTime < 10 * 60 * 1000) {
        setCountdown(Math.ceil((10 * 60 * 1000 - idleTime) / 1000));
        if (!inactivityModalOpened) {
          openInactivityModal();
        }
      } else if (idleTime >= 10 * 60 * 1000) {
        handleLockVault();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [vaultManager, lastActive, inactivityModalOpened]);

  // Mobile/OS Background check
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const idleTime = Date.now() - lastActive;
        if (idleTime >= 10 * 60 * 1000 && vaultManager) {
          handleLockVault();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastActive, vaultManager]);

  useEffect(() => {
    if (vaultManager && storage) {
      const loadSync = async () => {
        const engine = new SyncEngine(storage, vaultManager.identity!);
        setSyncEngine(engine);
        const fetchedYears = await engine.getYears();
        setYears(fetchedYears);
      };
      
      const handleAuthFailure = (err: any) => {
        console.error(err);
        if (err instanceof UnauthorizedError) {
          handleLogout();
        }
      };

      loadSync().catch(handleAuthFailure);
    }
  }, [vaultManager, storage]);

  useEffect(() => {
    if (!syncEngine || !activeEntryPath) return;
    
    if (isNewEntryRef.current) {
      isNewEntryRef.current = false;
      return;
    }

    // Load active entry
    syncEngine.fetchEntry(activeEntryPath).then(entry => {
      if (entry) {
        setActiveEntryId(entry.id);
        setEditorTitle(entry.title);
        setEditorContent(entry.plaintext);
        setEditorDate(entry.date);
        
        setInitialEditorTitle(entry.title);
        setInitialEditorContent(entry.plaintext);
        setInitialEditorDate(entry.date);
      }
    }).catch(err => {
      if (err instanceof UnauthorizedError) handleLogout();
    });
  }, [activeEntryPath, syncEngine]);

  const handleLogout = useCallback(() => {
    clearCachedGoogleToken();
    setStorage(null);
    setVaultManager(null);
    setSyncEngine(null);
    setYears([]);
    setEntriesByYear({});
    setActiveEntryPath(null);
    setActiveEntryId(null);
  }, []);

  const handleCloseEntry = () => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to close this entry?")) {
        return;
      }
    }
    setActiveEntryPath(null);
  };

  const handleSave = async () => {
    if (!syncEngine || !activeEntryPath) return;
    setIsSaving(true);
    try {
      const journalEntry: JournalEntry = {
        id: activeEntryId || crypto.randomUUID(),
        title: editorTitle || 'Untitled Entry',
        plaintext: editorContent || '',
        date: editorDate,
        mediaIds: []
      };
      const newPath = await syncEngine.saveEntry(journalEntry);
      
      const year = newPath.split('/')[0];
      setEntriesByYear(prev => {
        const yearEntries = prev[year] || [];
        if (!yearEntries.includes(newPath)) {
          return { ...prev, [year]: [newPath, ...yearEntries].sort((a, b) => b.localeCompare(a)) };
        }
        return prev;
      });
      if (!years.includes(year)) {
        setYears(prev => [...prev, year].sort((a,b) => b.localeCompare(a)));
      }
      setActiveEntryPath(newPath);
      setInitialEditorTitle(journalEntry.title);
      setInitialEditorContent(journalEntry.plaintext);
      setInitialEditorDate(journalEntry.date);
    } catch (e) {
      console.error(e);
      if (e instanceof UnauthorizedError) {
        handleLogout();
      } else {
        alert("Failed to save and sync entry.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = () => {
    if (!syncEngine) return;
    
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to start a new entry?")) {
        closeNewEntryModal();
        return;
      }
    }
    
    const id = crypto.randomUUID();
    const dateStr = dayjs(newEntryDate || new Date()).format('YYYY-MM-DD_HH-mm');
    
    setEditorTitle('');
    setEditorContent('');
    setEditorDate(dateStr);
    
    setInitialEditorTitle('');
    setInitialEditorContent('');
    setInitialEditorDate(dateStr);
    
    setActiveEntryId(id);
    
    const path = SyncEngine.getEntryPath(dateStr);
    isNewEntryRef.current = true;
    setActiveEntryPath(path);
    closeNewEntryModal();
  };

  const handleYearToggle = async (year: string) => {
    if (!entriesByYear[year]) {
      const yearEntries = await syncEngine!.getEntriesForYear(year);
      setEntriesByYear(prev => ({ ...prev, [year]: yearEntries }));
    }
  };

  if (!storage) return <AuthWall onAuthenticated={setStorage} />;
  if (!vaultManager) return <VaultSetupWall storage={storage} onVaultReady={setVaultManager} onAuthError={handleLogout} />;

  if (!syncEngine) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="xl" variant="dots" />
      </Center>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      navbar={{
        width: 320,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="0"
    >
      <AppShell.Header style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group h="100%" px={6} justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text
              size="xl"
              fw={900}
              variant="gradient"
              gradient={{ from: 'indigo', to: 'cyan', deg: 45 }}
              style={{ letterSpacing: '1px' }}
            >
              Silent Memoirs
            </Text>
          </Group>
          <Group>
            <Tooltip label="Logout & Disconnect">
              <ActionIcon onClick={handleLogout} variant="light" color="red" size="lg" radius="md">
                <IconLogout size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Toggle theme">
              <ActionIcon onClick={toggleColorScheme} variant="default" size="lg" radius="md">
                {colorScheme === 'dark' ? <IconSun size={20} stroke={1.5} /> : <IconMoon size={20} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" style={{ borderRight: '1px solid var(--mantine-color-default-border)', display: 'flex', flexDirection: 'column' }}>
        <Button variant="light" color="indigo" fullWidth mb="md" mt="md" onClick={openNewEntryModal} leftSection={<IconPlus size={16} stroke={1.5} />}>
          New Entry
        </Button>
        <Text c="dimmed" size="xs" fw={700} mb="xs" px="xs">YOUR ENTRIES</Text>
        
        <ScrollArea style={{ flex: 1 }}>
          {years.length === 0 && <Text c="dimmed" size="sm" ta="center" mt="xl">No entries yet.</Text>}
          {years.map((year) => (
            <NavLink
              key={year}
              label={year}
              fw={700}
              childrenOffset={28}
              onClick={() => handleYearToggle(year)}
            >
              {entriesByYear[year] ? (
                entriesByYear[year].length === 0 ? (
                  <Text size="xs" c="dimmed" p="xs">Empty</Text>
                ) : (
                  entriesByYear[year].map(path => {
                    const filename = path.split('/').pop() || '';
                    const label = filename.replace('.age', '').replace('_', ' '); // '2024-04-08 13-45'
                    return (
                      <NavLink
                        key={path}
                        active={path === activeEntryPath}
                        label={label}
                        onClick={() => {
                          if (path !== activeEntryPath && isDirty) {
                            if (!window.confirm("You have unsaved changes. Change entry anyway?")) return;
                          }
                          setActiveEntryPath(path);
                        }}
                        color="indigo"
                        variant="filled"
                        style={{ borderRadius: 'var(--mantine-radius-md)', marginBottom: '4px' }}
                      />
                    );
                  })
                )
              ) : (
                <Text size="xs" c="dimmed" p="xs">Loading...</Text>
              )}
            </NavLink>
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-body)">
        <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
          {activeEntryPath ? (
            <>
              <Flex gap="md" align="center" style={{ padding: '0.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                <TextInput 
                  value={editorTitle} 
                  onChange={(e) => setEditorTitle(e.currentTarget.value)}
                  placeholder="Entry Title"
                  variant="unstyled"
                  size="xl"
                  fw={700}
                  style={{ flex: 1 }}
                />
                <Text size="xs" c="dimmed" pt={5}>{editorDate}</Text>
                <Group gap={6}>
                  <Tooltip label="Save & Sync">
                    <ActionIcon loading={isSaving} onClick={handleSave}  color="teal" variant="light" size="lg">
                      <IconDeviceFloppy size={20} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Close / Cancel">
                    <ActionIcon onClick={handleCloseEntry} variant="light" color="red" size="lg">
                      <IconX size={20} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Flex>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Editor
                  key={activeEntryPath}
                  value={editorContent}
                  onChange={(val) => setEditorContent(val)}
                />
              </div>
            </>
          ) : (
            <Center style={{ flex: 1 }}>
              <Text c="dimmed">Select an entry from the sidebar or create a new one.</Text>
            </Center>
          )}
        </div>
      </AppShell.Main>

      <Modal opened={newEntryModalOpened} onClose={closeNewEntryModal} title="Create New Entry" centered>
        <DateInput
          label="Entry Date"
          description="You can backdate your journal entries"
          value={newEntryDate}
          onChange={(val: any) => setNewEntryDate(val)}
          mb="md"
        />
        <Button onClick={handleCreateNew} fullWidth>Start Writing</Button>
      </Modal>

      <Modal opened={inactivityModalOpened} onClose={() => {}} title="Inactivity Warning" centered closeOnClickOutside={false} closeOnEscape={false} withCloseButton={false}>
        <Text mb="md">
          Your vault will lock automatically in <b>{countdown} seconds</b> due to inactivity.
        </Text>
        <Text size="sm" c="dimmed" mb="lg">
          Unsaved changes will be preserved in memory and restored when you unlock.
        </Text>
        <Group justify="flex-end">
          <Button color="gray" variant="light" onClick={handleLockVault}>Lock Now</Button>
          <Button onClick={() => { setLastActive(Date.now()); closeInactivityModal(); }}>Continue Session</Button>
        </Group>
      </Modal>
    </AppShell>
  );
}
