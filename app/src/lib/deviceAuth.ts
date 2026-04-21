import { bufferToHex } from './crypto';

export interface DeviceAuthContext {
  deviceId: string;
  deviceLabel: string;
  platformLabel: string;
  isMobile: boolean;
  webAuthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
}

function detectPlatformLabel(userAgent: string, platform: string): string {
  const ua = userAgent.toLowerCase();
  const platformValue = platform.toLowerCase();

  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
  if (platformValue.includes('win') || ua.includes('windows')) return 'Windows';
  if (platformValue.includes('mac') || ua.includes('mac os')) return 'macOS';
  if (platformValue.includes('linux') || ua.includes('linux')) return 'Linux';
  return 'Unknown Platform';
}

async function computeDeviceId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return bufferToHex(digest).slice(0, 24);
}

async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (typeof PublicKeyCredential === 'undefined') return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function getDeviceAuthContext(): Promise<DeviceAuthContext> {
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const language = navigator.language || 'unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const screenSize = `${window.screen.width}x${window.screen.height}`;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const hardwareConcurrency = navigator.hardwareConcurrency || 0;

  const seed = [
    userAgent,
    platform,
    language,
    timezone,
    screenSize,
    maxTouchPoints.toString(),
    hardwareConcurrency.toString(),
  ].join('|');

  const platformLabel = detectPlatformLabel(userAgent, platform);
  const browserLabel = (() => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('edg/')) return 'Edge';
    if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome';
    if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
    if (ua.includes('firefox/')) return 'Firefox';
    return 'Browser';
  })();

  const isMobile = /android|iphone|ipad|ipod/i.test(userAgent) || maxTouchPoints > 1;
  const webAuthnSupported = typeof PublicKeyCredential !== 'undefined' && window.isSecureContext;
  const platformAuthenticatorAvailable = await isPlatformAuthenticatorAvailable();

  return {
    deviceId: await computeDeviceId(seed),
    deviceLabel: `${platformLabel} (${browserLabel})`,
    platformLabel,
    isMobile,
    webAuthnSupported,
    platformAuthenticatorAvailable,
  };
}
