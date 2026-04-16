export interface JournalEntry {
  id: string;
  title: string;
  plaintext: string;
  date: string; // YYYY-MM-DD
  mediaIds: string[];
}

export interface StorageDirectoryItem {
  path: string;
  name: string;
  isFolder: boolean;
  updatedAt: string;
}

export interface StorageProvider {
  uploadFile(path: string, data: Blob | Uint8Array, mimeType?: string): Promise<void>;
  downloadFile(path: string): Promise<Uint8Array | null>;
  listDirectoryItems(pathPrefix: string): Promise<StorageDirectoryItem[]>;
  listFiles(pathPrefix: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class GoogleDriveStorage implements StorageProvider {
  private accessToken: string;
  private pathCache: Map<string, string> = new Map(); // path -> fileId
  private rootFolder = 'silent-memoirs';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetchAPI(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`https://www.googleapis.com/drive/v3${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      if (res.status === 401) throw new UnauthorizedError();
      if (res.status === 404) return null;
      throw new Error(`Google Drive API Error: ${res.statusText}`);
    }
    return res;
  }

  private getFullPath(path: string): string {
    if (path.startsWith(`${this.rootFolder}/`)) return path;
    return `${this.rootFolder}/${path}`.replace(/\/+/g, '/');
  }

  private normalizeCachePath(path: string): string {
    return path.split('/').filter(Boolean).join('/');
  }

  private async getFileIdByPath(path: string): Promise<string | null> {
    const normalizedPath = this.normalizeCachePath(path);
    if (this.pathCache.has(normalizedPath)) return this.pathCache.get(normalizedPath)!;

    const parts = normalizedPath.split('/').filter(Boolean);
    let currentParentId = 'root';
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (this.pathCache.has(currentPath)) {
        currentParentId = this.pathCache.get(currentPath)!;
        continue;
      }

      const q = `name='${part}' and '${currentParentId}' in parents and trashed=false`;
      const res = await this.fetchAPI(`/files?q=${encodeURIComponent(q)}&fields=files(id,mimeType)`);
      if (!res) return null;
      const data = await res.json();
      
      if (data.files && data.files.length > 0) {
        currentParentId = data.files[0].id;
        this.pathCache.set(currentPath, currentParentId);
      } else {
        return null;
      }
    }

    this.pathCache.set(normalizedPath, currentParentId);
    return currentParentId;
  }

  private async createFolder(name: string, parentId: string = 'root'): Promise<string> {
    const metadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    const data = await res.json();
    return data.id;
  }

  private async ensurePathFolders(path: string): Promise<string> {
    const normalizedPath = this.normalizeCachePath(path);
    const parts = normalizedPath.split('/').filter(Boolean);
    parts.pop(); // Remove the filename itself
    
    let currentParentId = 'root';
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (this.pathCache.has(currentPath)) {
        currentParentId = this.pathCache.get(currentPath)!;
        continue;
      }

      const existingId = await this.getFileIdByPath(currentPath);
      if (existingId) {
        currentParentId = existingId;
      } else {
        currentParentId = await this.createFolder(part, currentParentId);
        this.pathCache.set(currentPath, currentParentId);
      }
    }
    return currentParentId;
  }

  async uploadFile(path: string, data: Blob | Uint8Array, mimeType = 'application/octet-stream'): Promise<void> {
    const fullPath = this.getFullPath(path);
    const existingId = await this.getFileIdByPath(fullPath);
    const parentId = await this.ensurePathFolders(fullPath);
    const filename = fullPath.split('/').pop()!;

    const metadata = {
      name: filename,
      ...(existingId ? {} : { parents: [parentId] })
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([data as any], { type: mimeType }));

    const url = existingId 
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: form
    });

    if (!res.ok) {
      if (res.status === 401) throw new UnauthorizedError();
      throw new Error('Upload failed');
    }
    const responseData = await res.json();
    this.pathCache.set(this.normalizeCachePath(fullPath), responseData.id);
  }

  async downloadFile(path: string): Promise<Uint8Array | null> {
    const fileId = await this.getFileIdByPath(this.getFullPath(path));
    if (!fileId) return null;

    const res = await this.fetchAPI(`/files/${fileId}?alt=media`);
    if (!res) return null;
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async listDirectoryItems(pathPrefix: string): Promise<StorageDirectoryItem[]> {
    const fullPrefix = this.getFullPath(pathPrefix);
    const parentId = await this.getFileIdByPath(fullPrefix);
    if (!parentId) return [];

    const q = `'${parentId}' in parents and trashed=false`;
    const res = await this.fetchAPI(`/files?q=${encodeURIComponent(q)}&fields=files(name,mimeType,modifiedTime)`);
    if (!res) return [];
    
    const data = await res.json();

    return (data.files || []).map((f: any): StorageDirectoryItem => {
      const cleanPrefix = pathPrefix.replace(/\/$/, "");
      return {
        path: cleanPrefix ? `${cleanPrefix}/${f.name}` : f.name,
        name: f.name,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        updatedAt: f.modifiedTime || new Date().toISOString(),
      };
    });
  }

  async listFiles(pathPrefix: string): Promise<string[]> {
    const entries = await this.listDirectoryItems(pathPrefix);
    return entries.map((entry) => entry.path);
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    const fileId = await this.getFileIdByPath(fullPath);
    if (!fileId) return;

    await this.fetchAPI(`/files/${fileId}`, { method: 'DELETE' });
    this.pathCache.delete(this.normalizeCachePath(fullPath));
  }
}
