import { bufferToHex } from './crypto';

const PRF_SALT = new Uint8Array([
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
  0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
  0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
]);

interface PrfClientExtensionResults {
  prf?: {
    results?: {
      first?: ArrayBuffer;
    };
  };
}

function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function ensureWebAuthnContext(): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error('Platform authenticator requires a secure context (https or localhost).');
  }

  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) {
    throw new Error('WebAuthn is not supported on this browser/device.');
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    throw new Error('Platform authenticator is not available on this browser/device.');
  }

  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!available) {
    throw new Error('No platform authenticator is available on this device.');
  }
}

export async function isPlatformWebAuthnAvailable(): Promise<boolean> {
  if (!window.isSecureContext) return false;
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function readPrfOutput(credential: PublicKeyCredential): string {
  const extensionResults = credential.getClientExtensionResults() as PrfClientExtensionResults;
  const prfOutput = extensionResults.prf?.results?.first;
  if (!(prfOutput instanceof ArrayBuffer)) {
    throw new Error('Authenticator did not provide PRF output.');
  }
  return bufferToHex(prfOutput);
}

export async function registerPlatformCredentialWithPrf(rpName: string): Promise<{ credentialId: string; prfKeyHex: string }> {
  await ensureWebAuthnContext();

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const extensions = { prf: { eval: { first: PRF_SALT } } } as unknown as AuthenticationExtensionsClientInputs;

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: rpName },
      user: {
        id: userId,
        name: `silent-memoirs-${Date.now()}`,
        displayName: 'Silent Memoirs Vault User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60_000,
      extensions,
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Platform authenticator registration failed or was cancelled.');
  }

  return {
    credentialId: toBase64Url(new Uint8Array(credential.rawId)),
    prfKeyHex: readPrfOutput(credential),
  };
}

export async function authenticatePlatformCredentialWithPrf(credentialId: string): Promise<string> {
  await ensureWebAuthnContext();

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const extensions = { prf: { eval: { first: PRF_SALT } } } as unknown as AuthenticationExtensionsClientInputs;

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      userVerification: 'required',
      allowCredentials: [
        {
          id: fromBase64Url(credentialId),
          type: 'public-key',
        },
      ],
      timeout: 60_000,
      extensions,
    },
  });

  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error('Platform authenticator authentication failed or was cancelled.');
  }

  return readPrfOutput(assertion);
}
