import { decrypt_with_user_passphrase, decrypt_with_x25519, encrypt_with_user_passphrase, encrypt_with_x25519, keygen } from '@kanru/rage-wasm';

export interface AgeIdentity {
  publicKey: string;
  secretKey: string;
}

// Convert a Uint8Array to a hex string to use as a passphrase
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateAgeIdentity(): Promise<AgeIdentity> {
  const [secretKey, publicKey] = await keygen();
  return { publicKey: publicKey.trim(), secretKey: secretKey.trim() };
}

// Encrypt payload using the vault's X25519 public key
export async function encryptData(publicKey: string, data: string | Uint8Array, armor = false): Promise<Uint8Array> {
  const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return await encrypt_with_x25519(publicKey, payload, armor);
}

// Decrypt payload using the vault's X25519 secret key
export async function decryptData(secretKey: string, encrypted: Uint8Array): Promise<string> {
  const resultBytes = await decrypt_with_x25519(secretKey, encrypted);
  return new TextDecoder().decode(resultBytes);
}

// Encrypt payload using the vault's X25519 secret key for binary files
export async function decryptBinary(secretKey: string, encrypted: Uint8Array): Promise<Uint8Array> {
    return await decrypt_with_x25519(secretKey, encrypted);
}

// Wrap (encrypt) the master secret key itself using the WebAuthn PRF key as a passphrase
export async function wrapSecretKey(prfKey: string, secretKey: string): Promise<Uint8Array> {
  return await encrypt_with_user_passphrase(prfKey, new TextEncoder().encode(secretKey), false);
}

// Unwrap (decrypt) the master secret key using the WebAuthn PRF key
export async function unwrapSecretKey(prfKey: string, wrappedBytes: Uint8Array): Promise<string> {
  const decrypted = await decrypt_with_user_passphrase(prfKey, wrappedBytes);
  return new TextDecoder().decode(decrypted);
}

// WebAuthn PRF Implementation
const PRF_SALT = new Uint8Array([
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 
  0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00,
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 
  0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00
]);

async function bufToHexPrf(buffer: ArrayBuffer): Promise<string> {
  return bufferToHex(buffer);
}

export async function registerWebAuthnPrf(): Promise<string> {
  if (!navigator.credentials || !navigator.credentials.create) {
    throw new Error("WebAuthn is not supported in this environment.");
  }
  
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Silent Memoirs Secure Journal" },
      user: { id: userId, name: "owner", displayName: "Vault Owner" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      extensions: {
        prf: { eval: { first: PRF_SALT } }
      }
    }
  }) as PublicKeyCredential;

  if (!cred) throw new Error("Registration cancelled or failed.");

  const extResults = cred.getClientExtensionResults() as any;
  if (!extResults.prf || !extResults.prf.results || !extResults.prf.results.first) {
    throw new Error("Authenticator does not support the PRF extension.");
  }

  return await bufToHexPrf(extResults.prf.results.first);
}

export async function authenticateWebAuthnPrf(): Promise<string> {
  if (!navigator.credentials || !navigator.credentials.get) {
    throw new Error("WebAuthn is not supported in this environment.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const asrt = await navigator.credentials.get({
    publicKey: {
      challenge,
      userVerification: "required",
      extensions: {
        prf: { eval: { first: PRF_SALT } }
      }
    }
  }) as PublicKeyCredential;

  if (!asrt) throw new Error("Authentication cancelled or failed.");

  const extResults = asrt.getClientExtensionResults() as any;
  if (!extResults.prf || !extResults.prf.results || !extResults.prf.results.first) {
    throw new Error("Authenticator did not return PRF results.");
  }

  return await bufToHexPrf(extResults.prf.results.first);
}

// Fallback for hardware that doesn't support WebAuthn PRF
export async function deriveKeyFromPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: PRF_SALT,
      iterations: 600000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bufferToHex(derivedBits);
}
