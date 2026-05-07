import {
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  NavLink,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import {
  IconEdit,
  IconFolder,
  IconHeart,
  IconLock,
  IconLogout,
  IconMoon,
  IconPencilPlus,
  IconPlus,
  IconSettings,
  IconSun,
  IconUser,
} from "@tabler/icons-react";
import { Suspense, useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import logoDark from "../assets/logo-dark.svg";
import logoLight from "../assets/logo-light.svg";

import { useAppContext } from "../contexts/AppContext";
import { IDLE_EXPORT_STATE } from "../lib/export/exportTypes";
import { cancelExport } from "../lib/export/pdfExport";
import { ROUTES } from "../lib/routes";
import { ExportProgressIndicator } from "./ExportProgressIndicator";
import { SessionTimerWidget } from "./SessionTimerWidget";

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
    discardStagedForEntry,
    userProfile,
    exportJobState,
    setExportJobState,
    isExportRunning,
  } = useAppContext();

  const [opened, { toggle, close }] = useDisclosure();
  const [
    logoutModalOpened,
    { open: openLogoutModal, close: closeLogoutModal },
  ] = useDisclosure(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const navigate = useNavigate();

  useHotkeys([["mod+shift+L", performVaultLock]]);

  const userInitials = useMemo(() => {
    const name = userProfile?.name?.trim();
    if (!name) return null;

    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;

    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    return initials || null;
  }, [userProfile?.name]);

  const activeSegment = useMemo(() => {
    if (location.pathname.startsWith(ROUTES.editor)) return "editor";
    if (location.pathname.startsWith(ROUTES.entries)) return "entries";
    if (location.pathname.startsWith(ROUTES.viewer)) return "viewer";
    if (location.pathname.startsWith(ROUTES.settings)) return "settings";
    if (location.pathname.startsWith(ROUTES.emotionbook)) return "emotionbook";
    return null;
  }, [location.pathname]);

  useEffect(() => {
    close();
  }, [location.pathname, close]);

  if (!storage) {
    return <Navigate to={ROUTES.login} replace />;
  }

  if (!vaultManager) {
    return <Navigate to={ROUTES.unlock} replace />;
  }

  if (!syncEngine) {
    return (
      <Center style={{ height: "100vh" }}>
        <Loader size="xl" variant="dots" />
      </Center>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      navbar={{
        width: 320,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="0"
    >
      <AppShell.Header
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Group h="100%" px={"sm"} justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <img
              src={colorScheme === "dark" ? logoDark : logoLight}
              alt="Silent Memoirs"
              style={{ height: 50, width: "auto", display: "block" }}
            />
          </Group>
          <Group>
            {/* <DebugManifestButton /> */}
            <SessionTimerWidget />
            <Menu shadow="md" width={240} position="bottom-end" withArrow>
              <Menu.Target>
                <Tooltip label={userProfile?.name ?? "Account menu"}>
                  <UnstyledButton>
                    <Avatar
                      src={userProfile?.picture ?? null}
                      alt={userProfile?.name ?? "Google user avatar"}
                      radius="xl"
                      size="md"
                    >
                      {userInitials ?? <IconUser size={16} stroke={1.7} />}
                    </Avatar>
                  </UnstyledButton>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{userProfile?.name ?? "Google User"}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLock size={16} stroke={1.7} />}
                  onClick={performVaultLock}
                >
                  Lock Vault
                </Menu.Item>
                <Menu.Item
                  leftSection={
                    colorScheme === "dark" ? (
                      <IconSun size={16} stroke={1.7} />
                    ) : (
                      <IconMoon size={16} stroke={1.7} />
                    )
                  }
                  onClick={toggleColorScheme}
                >
                  {colorScheme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} stroke={1.7} />}
                  onClick={openLogoutModal}
                  disabled={isSaving || isExportRunning}
                >
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="sm"
        style={{
          borderRight: "1px solid var(--mantine-color-default-border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--mantine-spacing-xs)" }}>
          <Button
            variant="light"
            fullWidth
            onClick={() => {
              // We navigate to /editor without path so Editor module auto-starts draft.
              // Note: discard changes confirm should be handled by the module unmount,
              // BUT it's safer to confirm here just in case.
              // We'll pass state={action: 'new_entry'} to let Editor know we want a new draft regardless.
              if (
                !confirmDiscardChanges(
                  "You have unsaved changes. Are you sure you want to start a new entry?",
                )
              )
                return;

              void discardStagedForEntry(activeEntryPath);
              navigate(ROUTES.editor, { state: { forceNew: true } });
              close();
            }}
            leftSection={<IconPlus size={16} stroke={1.5} />}
          >
            New Entry
          </Button>
          <NavLink
            label="Editor"
            leftSection={<IconEdit size={16} stroke={1.5} />}
            rightSection={
              isDirty && activeSegment !== "editor" ? (
                <IconPencilPlus size={16} style={{ opacity: 0.6 }} />
              ) : null
            }
            style={{ borderRadius: "0.5rem" }}
            active={activeSegment === "editor"}
            onClick={() => {
              if (activeSegment !== "editor") {
                navigate(ROUTES.editor);
                close();
              }
            }}
          />
          <NavLink
            label="All Entries"
            leftSection={<IconFolder size={16} stroke={1.5} />}
            style={{ borderRadius: "0.5rem" }}
            active={activeSegment === "entries"}
            onClick={() => {
              // Draft is preserved in context — no discard warning needed for navigation.
              navigate(ROUTES.entries);
              close();
            }}
          />

          <NavLink
            label="EmotionBook"
            leftSection={<IconHeart size={16} stroke={1.5} />}
            style={{ borderRadius: "0.5rem" }}
            active={activeSegment === "emotionbook"}
            onClick={() => {
              navigate(ROUTES.emotionbook);
              close();
            }}
          />
          <NavLink
            label="Vault Settings"
            leftSection={<IconSettings size={16} stroke={1.5} />}
            style={{ borderRadius: "0.5rem" }}
            active={activeSegment === "settings"}
            onClick={() => {
              // Draft is preserved in context — no discard warning needed for navigation.
              navigate(ROUTES.settings);
              close();
            }}
          />
        </Box>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-body)">
        <div
          style={{
            height: "calc(100vh - 70px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Suspense
            fallback={
              <Center style={{ flex: 1 }}>
                <Loader size="xl" variant="dots" />
              </Center>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </AppShell.Main>

      <Modal
        opened={logoutModalOpened}
        onClose={closeLogoutModal}
        title="Confirm Logout"
        centered
      >
        <Text size="sm" mb="lg">
          {isDirty
            ? "You have unsaved changes. If you log out now, your unsaved text and staged media will be lost. Are you sure you want to disconnect?"
            : isExportRunning
              ? "A PDF export is currently in progress. Logging out will cancel the export. Are you sure you want to disconnect?"
              : "Are you sure you want to log out and disconnect your session?"}
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={closeLogoutModal}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              closeLogoutModal();
              handleLogout();
            }}
          >
            Logout & Disconnect
          </Button>
        </Group>
      </Modal>

      <ExportProgressIndicator
        state={exportJobState}
        onCancel={cancelExport}
        onDismiss={() => setExportJobState(IDLE_EXPORT_STATE)}
      />
    </AppShell>
  );
}
