import {
  ActionIcon,
  AppShell,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  NavLink,
  Text,
  Tooltip,
  useMantineColorScheme
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconEdit,
  IconFolder,
  IconMoon,
  IconPlus,
  IconSun
} from '@tabler/icons-react';
import { Suspense, useMemo } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAppContext } from '../contexts/AppContext';
import { ROUTES, buildEditorRoute } from '../lib/routes';
import { LogoutButton } from './LogoutButton';
import { VaultLockButton } from './VaultLockButton';

export function ProtectedLayout() {
  const { 
    storage, 
    vaultManager, 
    syncEngine, 
    isDirty, 
    isSaving, 
    activeEntryPath, 
    handleLogout, 
    performVaultLock,
    confirmDiscardChanges,
    discardStagedForEntry
  } = useAppContext();

  const [opened, { toggle }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const navigate = useNavigate();

  const activeSegment = useMemo(() => {
    if (location.pathname.startsWith(ROUTES.editor)) return 'editor';
    if (location.pathname.startsWith(ROUTES.entries)) return 'entries';
    if (location.pathname.startsWith(ROUTES.viewer)) return 'viewer';
    return null;
  }, [location.pathname]);

  if (!storage) {
    return <Navigate to={ROUTES.login} replace />;
  }

  if (!vaultManager) {
    return <Navigate to={ROUTES.unlock} replace />;
  }

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
            {/* <DebugManifestButton /> */}
            <Tooltip label="Toggle theme">
              <ActionIcon onClick={toggleColorScheme} variant="default" size="lg" radius="md">
                {colorScheme === 'dark' ? <IconSun size={20} stroke={1.5} /> : <IconMoon size={20} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" style={{ borderRight: '1px solid var(--mantine-color-default-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <Button
            variant="light"
            color="indigo"
            fullWidth
            mb="md"
            mt="md"
            onClick={() => {
              // We navigate to /editor without path so Editor module auto-starts draft.
              // Note: discard changes confirm should be handled by the module unmount, 
              // BUT it's safer to confirm here just in case. 
              // We'll pass state={action: 'new_entry'} to let Editor know we want a new draft regardless.
              if (!confirmDiscardChanges('You have unsaved changes. Are you sure you want to start a new entry?')) return;
              
              void discardStagedForEntry(activeEntryPath);
              navigate(ROUTES.editor, { state: { forceNew: true } });
            }}
            leftSection={<IconPlus size={16} stroke={1.5} />}
          >
            New Entry
          </Button>

          <NavLink
            label="Editor"
            leftSection={<IconEdit size={16} stroke={1.5} />}
            style={{borderRadius: "0.5rem"}}
            active={activeSegment === 'editor'}
            mb="xs"
            onClick={() => {
              if (activeSegment !== 'editor' && activeEntryPath) {
                navigate(buildEditorRoute(activeEntryPath));
                return;
              }
              
              if (activeSegment !== 'editor') {
                 navigate(ROUTES.editor);
              }
            }}
          />
          <NavLink
            label="All Entries"
            leftSection={<IconFolder size={16} stroke={1.5} />}
            style={{borderRadius: "0.5rem"}}
            active={activeSegment === 'entries'}
            mb="md"
            onClick={async () => {
              if (!confirmDiscardChanges('You have unsaved changes. Continue to entries anyway?')) return;
              await discardStagedForEntry(activeEntryPath);
              // Since currentDirectoryPath is encapsulated in Entries module, we just route to `/entries` 
              // and let the module load its last visited or root automatically.
              navigate(ROUTES.entries);
            }}
          />
        </div>
        <div style={{ paddingTop: 'var(--mantine-spacing-sm)', borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <VaultLockButton onLock={performVaultLock} />
          <LogoutButton onLogout={handleLogout} isDirty={Boolean(isDirty)} isSaving={isSaving} />
        </div>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-body)">
        <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={
            <Center style={{ flex: 1 }}>
              <Loader size="xl" variant="dots" />
            </Center>
          }>
            <Outlet />
          </Suspense>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
