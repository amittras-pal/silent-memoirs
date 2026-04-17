import type { StorageProvider } from './storage';
import type { AgeIdentity } from './crypto';
import { generateAgeIdentity, wrapSecretKey, unwrapSecretKey, registerWebAuthnPrf, authenticateWebAuthnPrf, deriveKeyFromPassword } from './crypto';

import instructionsText from '../assets/vault-directory-instructions.txt?raw';

const VAULT_KEY_FILE = 'vault_key.age';

export class VaultManager {
  private storage: StorageProvider;
  private currentIdentity: AgeIdentity | null = null;
  
  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  public get identity(): AgeIdentity | null {
    return this.currentIdentity;
  }

  // Determine if it's the first time linking this storage by checking for vault_key.age
  public async isVaultInitialized(): Promise<boolean> {
    const files = await this.storage.listFiles('');
    return files.includes(VAULT_KEY_FILE);
  }

  // For returning users
  public async unlockVault(fallbackPassword?: string): Promise<void> {
    const prfKeyHex = fallbackPassword 
      ? await deriveKeyFromPassword(fallbackPassword) 
      : await authenticateWebAuthnPrf();
      
    const wrappedKeyBytes = await this.storage.downloadFile(VAULT_KEY_FILE);
    
    if (!wrappedKeyBytes) {
      throw new Error("Vault key file is missing from remote storage.");
    }

    const secretKey = await unwrapSecretKey(prfKeyHex, wrappedKeyBytes);
    
    const pubKeyBytes = await this.storage.downloadFile('vault_pub.txt');
    if (!pubKeyBytes) throw new Error("Vault public key file is missing.");
    const publicKey = new TextDecoder().decode(pubKeyBytes).trim();

    this.currentIdentity = { publicKey, secretKey: secretKey.trim() };
  }

  // For new users
  public async initializeVault(fallbackPassword?: string): Promise<{ recoveryKey: string }> {
    const prfKeyHex = fallbackPassword 
      ? await deriveKeyFromPassword(fallbackPassword) 
      : await registerWebAuthnPrf();
      
    const identity = await generateAgeIdentity();
    
    const wrappedBytes = await wrapSecretKey(prfKeyHex, identity.secretKey);
    // Write the encrypted secret key
    await this.storage.uploadFile(VAULT_KEY_FILE, wrappedBytes);
    // Write the plaintext public key
    await this.storage.uploadFile('vault_pub.txt', new TextEncoder().encode(identity.publicKey), 'text/plain');

    try {
      await this.storage.uploadFile('README-Silent-Memoirs.txt', new TextEncoder().encode(instructionsText), 'text/plain');
    } catch (e) {
      throw new Error("Failed to upload vault instructions file. Vault initialization aborted.");
    }

    this.currentIdentity = identity;

    // We return the raw secret key so the UI can display it for backup.
    return { recoveryKey: identity.secretKey };
  }
}
