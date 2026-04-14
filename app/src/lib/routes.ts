export const ROUTES = {
  login: '/login',
  unlock: '/unlock',
  editor: '/editor',
  entries: '/entries',
  viewer: '/viewer',
};

function normalizePath(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('/').filter(Boolean).join('/');
}

export function encodeEntryPath(path: string): string {
  return encodeURIComponent(path);
}

export function decodeEntryPath(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function buildEditorRoute(path?: string | null): string {
  if (!path) return ROUTES.editor;
  return `${ROUTES.editor}?e=${encodeEntryPath(path)}`;
}

export function buildViewerRoute(path: string): string {
  return `${ROUTES.viewer}?e=${encodeEntryPath(path)}`;
}

export function encodeDirectoryPath(path: string): string {
  return encodeURIComponent(normalizePath(path));
}

export function decodeDirectoryPath(value: string | null): string {
  if (!value) return '';
  try {
    return normalizePath(decodeURIComponent(value));
  } catch {
    return '';
  }
}

export function buildEntriesRoute(directoryPath?: string | null): string {
  const normalized = normalizePath(directoryPath);
  if (!normalized) return ROUTES.entries;
  return `${ROUTES.entries}?dir=${encodeDirectoryPath(normalized)}`;
}
