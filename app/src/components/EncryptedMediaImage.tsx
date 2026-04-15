import { Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { StorageProvider } from '../lib/storage';
import {
  downloadAndDecryptImage,
  getMimeTypeForMediaPath,
  isEncryptedMediaPath,
  parsePendingMediaId,
} from '../lib/media';
import { getStagedMediaByPendingId } from '../lib/stagedMedia';

interface EncryptedMediaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  storage: StorageProvider;
  secretKey: string;
  containerStyle?: React.CSSProperties;
  loadingLabel?: string;
  allowPendingResolution?: boolean;
}

export function EncryptedMediaImage({
  src,
  alt,
  storage,
  secretKey,
  containerStyle,
  loadingLabel,
  allowPendingResolution = false,
  ...imgProps
}: EncryptedMediaImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      setErrorMessage(null);
      return;
    }

    const pendingId = parsePendingMediaId(src);
    if (pendingId) {
      if (!allowPendingResolution) {
        setResolvedSrc(null);
        setErrorMessage('Image is pending upload. Save this entry to sync it.');
        setIsLoading(false);
        return;
      }

      let active = true;
      let objectUrl: string | null = null;

      setIsLoading(true);
      setErrorMessage(null);

      getStagedMediaByPendingId(pendingId)
        .then((record) => {
          if (!active) return;
          if (!record) {
            throw new Error('Staged image data is unavailable. Please re-insert the image.');
          }

          objectUrl = URL.createObjectURL(record.blob);
          setResolvedSrc(objectUrl);
        })
        .catch((error: unknown) => {
          if (!active) return;
          const message = error instanceof Error ? error.message : 'Unable to resolve staged image.';
          setResolvedSrc(null);
          setErrorMessage(message);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });

      return () => {
        active = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    if (!isEncryptedMediaPath(src)) {
      setResolvedSrc(src);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    setIsLoading(true);
    setErrorMessage(null);

    downloadAndDecryptImage(storage, secretKey, src)
      .then((bytes) => {
        if (!active) return;

        const mimeType = getMimeTypeForMediaPath(src) ?? 'image/jpeg';
        const normalizedBytes = new Uint8Array(bytes.byteLength);
        normalizedBytes.set(bytes);
        const blob = new Blob([normalizedBytes], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to decrypt image.';
        setResolvedSrc(null);
        setErrorMessage(message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [allowPendingResolution, secretKey, src, storage]);

  if (!src) {
    return null;
  }

  return (
    <span
      style={{
        width: '100%',
        display: 'inline-flex',
        justifyContent: 'center',
        margin: '1rem 0',
        ...containerStyle,
      }}
    >
      {isLoading ? (
        <Text component="span" size="sm" c="dimmed">{loadingLabel ?? 'Decrypting image...'}</Text>
      ) : errorMessage ? (
        <Text component="span" size="sm" c="red">{errorMessage}</Text>
      ) : resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={alt ?? ''}
          {...imgProps}
          style={{
            display: 'block',
            maxWidth: '100%',
            borderRadius: 12,
            ...imgProps.style,
          }}
        />
      ) : null}
    </span>
  );
}
