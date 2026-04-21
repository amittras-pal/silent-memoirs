export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.profile';
export const GOOGLE_OAUTH_SCOPE = `${GOOGLE_DRIVE_FILE_SCOPE} ${GOOGLE_PROFILE_SCOPE}`;

export const GOOGLE_USER_PROFILE_STORAGE_KEY = 'google_user_profile';
export const GOOGLE_TOKEN_ISSUED_EVENT = 'google-token-issued';
export const GOOGLE_PROFILE_UPDATED_EVENT = 'google-profile-updated';

interface GoogleUserInfoResponse {
  name?: unknown;
  picture?: unknown;
}

export interface GoogleUserProfile {
  name: string;
  picture: string | null;
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return 'Google User';
  const trimmed = value.trim();
  return trimmed || 'Google User';
}

function normalizePicture(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseGoogleUserProfile(value: unknown): GoogleUserProfile | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    name: normalizeName(record.name),
    picture: normalizePicture(record.picture),
  };
}

function emitProfileUpdated(profile: GoogleUserProfile | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GoogleUserProfile | null>(GOOGLE_PROFILE_UPDATED_EVENT, { detail: profile }));
}

export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google profile (${res.status})`);
  }

  const data = (await res.json()) as GoogleUserInfoResponse;
  return {
    name: normalizeName(data.name),
    picture: normalizePicture(data.picture),
  };
}

export function loadCachedGoogleUserProfile(): GoogleUserProfile | null {
  const raw = localStorage.getItem(GOOGLE_USER_PROFILE_STORAGE_KEY);
  if (!raw) return null;

  try {
    return parseGoogleUserProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function cacheGoogleUserProfile(profile: GoogleUserProfile | null) {
  if (profile) {
    localStorage.setItem(GOOGLE_USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } else {
    localStorage.removeItem(GOOGLE_USER_PROFILE_STORAGE_KEY);
  }
  emitProfileUpdated(profile);
}

export function clearCachedGoogleUserProfile() {
  cacheGoogleUserProfile(null);
}

export function notifyGoogleTokenIssued(issuedAt: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<number>(GOOGLE_TOKEN_ISSUED_EVENT, { detail: issuedAt }));
}
