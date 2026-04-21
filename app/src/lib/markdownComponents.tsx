import { Blockquote } from '@mantine/core';
import { IconQuote } from '@tabler/icons-react';
import { EncryptedMediaImage } from '../components/EncryptedMediaImage';
import type { StorageProvider } from './storage';

type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: unknown;
};

type ChildrenProps = {
  node?: unknown;
  children?: React.ReactNode;
};

/**
 * Factory that returns the full markdown component override map for use with
 * `MDEditor.Markdown`. Centralises all custom renderers so Editor (preview)
 * and Viewer stay identical without duplicated logic.
 *
 * @param storage        Active vault StorageProvider
 * @param secretKey      AgeIdentity secret key for decrypting media
 * @param allowPendingResolution  Pass `true` in the Editor so staged-but-
 *                       not-yet-synced images are resolved from IndexedDB.
 *                       Viewer leaves this `false` (default).
 */
export function createMarkdownComponents(
  storage: StorageProvider,
  secretKey: string,
  allowPendingResolution = false
) {
  return {
    // ------------------------------------------------------------------ img
    img: ({ node: _node, ...props }: MarkdownImageProps) => (
      <EncryptedMediaImage
        {...props}
        storage={storage}
        secretKey={secretKey}
        allowPendingResolution={allowPendingResolution}
      />
    ),

    // ------------------------------------------------------------- blockquote
    blockquote: ({ node: _node, children }: ChildrenProps) => (
      <Blockquote
        color="indigo"
        py="xs"
        icon={<IconQuote size={16} />}
        iconSize={30}
        styles={{ root: { borderLeftColor: "var(--mantine-color-blue-6)" } }}
      >
        {children}
      </Blockquote>
    )
  };
}
