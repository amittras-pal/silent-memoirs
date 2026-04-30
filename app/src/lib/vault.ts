import type { StorageProvider } from './storage';
import type { AgeIdentity } from './crypto';
import type { KeyringWebAuthnSlot } from './keyring';
import {
  bufferToHex,
  decryptData,
  deriveKeyFromPassword,
  encryptData,
  generateAgeIdentity,
  wrapSecretKey,
  unwrapSecretKey,
} from './crypto';
import { KeyringManager } from './keyring';
import {
  authenticatePlatformCredentialWithPrf,
  isPlatformWebAuthnAvailable,
  registerPlatformCredentialWithPrf,
} from './webauthnPlatform';

import instructionsText from '../assets/vault-directory-instructions.txt?raw';
import decryptVaultSh from '../assets/decrypt-vault.sh?raw';
import decryptVaultPs1 from '../assets/Decrypt-Vault.ps1?raw';

const VAULT_KEY_FILE = 'vault_key.age';

export type SessionAuthMethod = 'password' | 'recovery-key' | 'webauthn-platform';

export interface VaultUnlockOutcome {
  method: SessionAuthMethod;
  slotId: string | null;
  label: string;
}

export interface VaultWebAuthnUnlockOptions {
  platformAvailable: boolean;
  slots: KeyringWebAuthnSlot[];
  recommendedSlotId: string | null;
}

export class VaultManager {
  private storage: StorageProvider;
  private keyringManager: KeyringManager;
  private currentIdentity: AgeIdentity | null = null;
  private unlockedViaRecovery = false;
  
  constructor(storage: StorageProvider) {
    this.storage = storage;
    this.keyringManager = new KeyringManager(storage);
  }

  public get identity(): AgeIdentity | null {
    return this.currentIdentity;
  }

  public get keyring(): KeyringManager {
    return this.keyringManager;
  }

  public get wasUnlockedWithRecoveryKey(): boolean {
    return this.unlockedViaRecovery;
  }

  public async getWebAuthnUnlockOptions(deviceId: string): Promise<VaultWebAuthnUnlockOptions> {
    const platformAvailable = await isPlatformWebAuthnAvailable();
    if (!platformAvailable) {
      return {
        platformAvailable: false,
        slots: [],
        recommendedSlotId: null,
      };
    }

    const options = await this.keyringManager.getUnlockOptionsForDevice(deviceId);
    return {
      platformAvailable,
      slots: options.slots,
      recommendedSlotId: options.recommendedSlotId,
    };
  }

  public async getWebAuthnMethods(): Promise<KeyringWebAuthnSlot[]> {
    const keyring = await this.keyringManager.readKeyring();
    return keyring.webauthnSlots;
  }

  public async addWebAuthnMethod(deviceId: string, deviceLabel: string): Promise<KeyringWebAuthnSlot> {
    if (!this.currentIdentity) {
      throw new Error('Vault must be unlocked before adding an authentication method.');
    }

    const { credentialId, prfKeyHex } = await registerPlatformCredentialWithPrf('Silent Memoirs Secure Vault');
    const wrappedSecretKeyBytes = await wrapSecretKey(prfKeyHex, this.currentIdentity.secretKey);

    return await this.keyringManager.addWebAuthnSlot({
      label: deviceLabel,
      deviceId,
      credentialId,
      wrappedSecretKeyBytes,
    });
  }

  public async revokeWebAuthnMethod(slotId: string): Promise<void> {
    await this.keyringManager.removeSlot(slotId);
  }

  private async loadVaultPublicKey(): Promise<string> {
    const pubKeyBytes = await this.storage.downloadFile('vault_pub.txt');
    if (!pubKeyBytes) throw new Error('Vault public key file is missing.');
    return new TextDecoder().decode(pubKeyBytes).trim();
  }

  private async validateRecoveryKey(secretKey: string, publicKey: string): Promise<void> {
    const challenge = `recovery-check-${bufferToHex(crypto.getRandomValues(new Uint8Array(16)))}`;
    try {
      const encryptedChallenge = await encryptData(publicKey, challenge);
      const decryptedChallenge = await decryptData(secretKey, encryptedChallenge);
      if (decryptedChallenge !== challenge) {
        throw new Error('Recovery key does not match vault identity.');
      }
    } catch {
      throw new Error('Recovery key is invalid for this vault.');
    }
  }

  // Determine if it's the first time linking this storage by checking for vault_key.age
  public async isVaultInitialized(): Promise<boolean> {
    const files = await this.storage.listFiles('');
    return files.includes(VAULT_KEY_FILE);
  }

  // For returning users
  public async unlockVault(password: string): Promise<VaultUnlockOutcome> {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required to unlock your vault.');
    }

    const derivedKeyHex = await deriveKeyFromPassword(normalizedPassword);
      
    const wrappedKeyBytes = await this.storage.downloadFile(VAULT_KEY_FILE);
    
    if (!wrappedKeyBytes) {
      throw new Error("Vault key file is missing from remote storage.");
    }

    let secretKey = '';
    try {
      secretKey = await unwrapSecretKey(derivedKeyHex, wrappedKeyBytes);
    } catch {
      throw new Error(
        'Unable to unlock vault. Your password may be incorrect. If you forgot it, use Recovery Key unlock.'
      );
    }

    const publicKey = await this.loadVaultPublicKey();

    this.currentIdentity = { publicKey, secretKey: secretKey.trim() };
    this.unlockedViaRecovery = false;

    return {
      method: 'password',
      slotId: null,
      label: 'Password',
    };
  }

  public async unlockVaultWithWebAuthn(slotId: string, deviceId: string): Promise<VaultUnlockOutcome> {
    const slot = await this.keyringManager.getSlotById(slotId);
    if (!slot) {
      throw new Error('The selected platform authenticator is no longer registered for this vault.');
    }

    const wrappedSecretKey = await this.keyringManager.decodeWrappedSecretForSlot(slot.id);
    if (!wrappedSecretKey) {
      throw new Error('Registered authenticator data is incomplete. Reconfigure this method from Vault Settings.');
    }

    const prfKeyHex = await authenticatePlatformCredentialWithPrf(slot.credentialId);

    let secretKey = '';
    try {
      secretKey = await unwrapSecretKey(prfKeyHex, wrappedSecretKey);
    } catch {
      throw new Error('Authenticator verification succeeded but vault decryption failed for this method.');
    }

    const publicKey = await this.loadVaultPublicKey();
    this.currentIdentity = { publicKey, secretKey: secretKey.trim() };
    this.unlockedViaRecovery = false;

    await this.keyringManager.markSlotUsed(slot.id, deviceId);

    return {
      method: 'webauthn-platform',
      slotId: slot.id,
      label: slot.label,
    };
  }

  public async unlockVaultWithRecoveryKey(recoveryKey: string): Promise<VaultUnlockOutcome> {
    const normalizedRecoveryKey = recoveryKey.trim().toUpperCase();
    if (!normalizedRecoveryKey) {
      throw new Error('Recovery key is required to unlock your vault.');
    }

    if (!normalizedRecoveryKey.startsWith('AGE-SECRET-KEY-')) {
      throw new Error('Recovery key format looks invalid. Please paste the full key exactly as provided.');
    }

    const publicKey = await this.loadVaultPublicKey();
    await this.validateRecoveryKey(normalizedRecoveryKey, publicKey);

    this.currentIdentity = { publicKey, secretKey: normalizedRecoveryKey };
    this.unlockedViaRecovery = true;

    return {
      method: 'recovery-key',
      slotId: null,
      label: 'Recovery Key',
    };
  }

  public async setNewPasswordAfterRecovery(newPassword: string): Promise<void> {
    if (!this.currentIdentity) {
      throw new Error('Vault must be unlocked before resetting the password.');
    }

    if (!this.unlockedViaRecovery) {
      throw new Error('Password reset via recovery is only available immediately after recovery-key unlock.');
    }

    const normalizedPassword = newPassword.trim();
    if (!normalizedPassword) {
      throw new Error('Please provide a new password.');
    }

    const derivedKeyHex = await deriveKeyFromPassword(normalizedPassword);
    const wrappedBytes = await wrapSecretKey(derivedKeyHex, this.currentIdentity.secretKey);

    await this.storage.uploadFile(VAULT_KEY_FILE, wrappedBytes);
    this.unlockedViaRecovery = false;
  }

  // For new users
  public async initializeVault(password: string): Promise<{ recoveryKey: string }> {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required to create your vault.');
    }

    const derivedKeyHex = await deriveKeyFromPassword(normalizedPassword);
      
    const identity = await generateAgeIdentity();
    
    const wrappedBytes = await wrapSecretKey(derivedKeyHex, identity.secretKey);
    // Write the encrypted secret key
    await this.storage.uploadFile(VAULT_KEY_FILE, wrappedBytes);
    // Write the plaintext public key
    await this.storage.uploadFile('vault_pub.txt', new TextEncoder().encode(identity.publicKey), 'text/plain');

    try {
      await this.storage.uploadFile('README-Silent-Memoirs.txt', new TextEncoder().encode(instructionsText), 'text/plain');
      await this.storage.uploadFile('decrypt-vault.sh', new TextEncoder().encode(decryptVaultSh), 'text/plain');
      await this.storage.uploadFile('Decrypt-Vault.ps1', new TextEncoder().encode(decryptVaultPs1), 'text/plain');
    } catch {
      throw new Error("Failed to upload vault instructions file. Vault initialization aborted.");
    }

    this.currentIdentity = identity;
    this.unlockedViaRecovery = false;

    // We return the raw secret key so the UI can display it for backup.
    return { recoveryKey: identity.secretKey };
  }
}
