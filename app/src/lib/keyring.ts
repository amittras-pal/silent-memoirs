import type { StorageProvider } from './storage';

export const KEYRING_FILE = 'vault_keyring.json';
const KEYRING_VERSION = 1;

export interface KeyringWebAuthnSlot {
  id: string;
  method: 'webauthn-platform';
  label: string;
  deviceId: string;
  credentialId: string;
  wrappedSecretKey: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface KeyringData {
  version: number;
  updatedAt: string;
  preferredSlotByDevice: Record<string, string>;
  webauthnSlots: KeyringWebAuthnSlot[];
}

export interface KeyringUnlockOptions {
  slots: KeyringWebAuthnSlot[];
  recommendedSlotId: string | null;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createEmptyKeyring(): KeyringData {
  return {
    version: KEYRING_VERSION,
    updatedAt: new Date().toISOString(),
    preferredSlotByDevice: {},
    webauthnSlots: [],
  };
}

function normalizeKeyring(parsed: unknown): KeyringData {
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyKeyring();
  }

  const candidate = parsed as Partial<KeyringData>;
  if (candidate.version !== KEYRING_VERSION) {
    throw new Error(`Unsupported keyring version: ${String(candidate.version ?? 'unknown')}`);
  }

  const normalizedSlots = Array.isArray(candidate.webauthnSlots)
    ? candidate.webauthnSlots
        .filter((slot): slot is KeyringWebAuthnSlot => {
          if (!slot || typeof slot !== 'object') return false;
          const c = slot as Partial<KeyringWebAuthnSlot>;
          return (
            c.method === 'webauthn-platform' &&
            typeof c.id === 'string' &&
            typeof c.label === 'string' &&
            typeof c.deviceId === 'string' &&
            typeof c.credentialId === 'string' &&
            typeof c.wrappedSecretKey === 'string' &&
            typeof c.createdAt === 'string' &&
            typeof c.lastUsedAt === 'string'
          );
        })
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    : [];

  return {
    version: KEYRING_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    preferredSlotByDevice:
      candidate.preferredSlotByDevice && typeof candidate.preferredSlotByDevice === 'object'
        ? (candidate.preferredSlotByDevice as Record<string, string>)
        : {},
    webauthnSlots: normalizedSlots,
  };
}

export class KeyringManager {
  private readonly storage: StorageProvider;

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  public async readKeyring(): Promise<KeyringData> {
    const bytes = await this.storage.downloadFile(KEYRING_FILE);
    if (!bytes) return createEmptyKeyring();

    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      return normalizeKeyring(parsed);
    } catch {
      throw new Error('Failed to parse keyring metadata.');
    }
  }

  public async writeKeyring(data: KeyringData): Promise<void> {
    const payload: KeyringData = {
      version: KEYRING_VERSION,
      updatedAt: new Date().toISOString(),
      preferredSlotByDevice: data.preferredSlotByDevice,
      webauthnSlots: data.webauthnSlots,
    };

    await this.storage.uploadFile(KEYRING_FILE, new TextEncoder().encode(JSON.stringify(payload, null, 2)), 'application/json');
  }

  public async getUnlockOptionsForDevice(deviceId: string): Promise<KeyringUnlockOptions> {
    const keyring = await this.readKeyring();
    const slots = keyring.webauthnSlots;
    if (slots.length === 0) {
      return { slots, recommendedSlotId: null };
    }

    const preferredSlotId = keyring.preferredSlotByDevice[deviceId];
    const preferredExists = slots.some((slot) => slot.id === preferredSlotId);
    if (preferredExists) {
      return { slots, recommendedSlotId: preferredSlotId };
    }

    const deviceSlot = slots.find((slot) => slot.deviceId === deviceId);
    if (deviceSlot) {
      return { slots, recommendedSlotId: deviceSlot.id };
    }

    return { slots, recommendedSlotId: slots[0].id };
  }

  public async addWebAuthnSlot(input: {
    label: string;
    deviceId: string;
    credentialId: string;
    wrappedSecretKeyBytes: Uint8Array;
  }): Promise<KeyringWebAuthnSlot> {
    const keyring = await this.readKeyring();

    const newSlot: KeyringWebAuthnSlot = {
      id: crypto.randomUUID(),
      method: 'webauthn-platform',
      label: input.label,
      deviceId: input.deviceId,
      credentialId: input.credentialId,
      wrappedSecretKey: bytesToBase64(input.wrappedSecretKeyBytes),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    keyring.webauthnSlots = [
      newSlot,
      ...keyring.webauthnSlots.filter((slot) => slot.credentialId !== input.credentialId),
    ];
    keyring.preferredSlotByDevice[input.deviceId] = newSlot.id;

    await this.writeKeyring(keyring);
    return newSlot;
  }

  public async markSlotUsed(slotId: string, deviceId?: string): Promise<void> {
    const keyring = await this.readKeyring();
    let changed = false;

    keyring.webauthnSlots = keyring.webauthnSlots.map((slot) => {
      if (slot.id !== slotId) return slot;
      changed = true;
      return {
        ...slot,
        lastUsedAt: new Date().toISOString(),
      };
    });

    if (deviceId && changed) {
      keyring.preferredSlotByDevice[deviceId] = slotId;
    }

    if (changed) {
      await this.writeKeyring(keyring);
    }
  }

  public async getSlotById(slotId: string): Promise<KeyringWebAuthnSlot | null> {
    const keyring = await this.readKeyring();
    return keyring.webauthnSlots.find((slot) => slot.id === slotId) ?? null;
  }

  public async removeSlot(slotId: string): Promise<void> {
    const keyring = await this.readKeyring();
    const nextSlots = keyring.webauthnSlots.filter((slot) => slot.id !== slotId);
    if (nextSlots.length === keyring.webauthnSlots.length) return;

    keyring.webauthnSlots = nextSlots;
    const nextPreferred = { ...keyring.preferredSlotByDevice };

    for (const [deviceId, preferredSlotId] of Object.entries(nextPreferred)) {
      if (preferredSlotId === slotId) {
        delete nextPreferred[deviceId];
      }
    }

    keyring.preferredSlotByDevice = nextPreferred;
    await this.writeKeyring(keyring);
  }

  public async decodeWrappedSecretForSlot(slotId: string): Promise<Uint8Array | null> {
    const keyring = await this.readKeyring();
    const slot = keyring.webauthnSlots.find((candidate) => candidate.id === slotId);
    if (!slot) return null;
    return base64ToBytes(slot.wrappedSecretKey);
  }
}
