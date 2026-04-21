import 'react-image-crop/dist/ReactCrop.css';

import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import type { PixelCrop } from '../lib/media';

interface ImageCropModalProps {
  opened: boolean;
  sourceUrl: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (crop: PixelCrop) => void;
}

function getDefaultCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 100 }, width / height, width, height),
    width,
    height,
  );
}

export function ImageCropModal({ opened, sourceUrl, isSubmitting, onCancel, onConfirm }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);

  useEffect(() => {
    if (!opened) return;
    setCrop(undefined);
    setCompletedCrop(null);
  }, [opened, sourceUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
    const initial = getDefaultCrop(width, height);
    setCrop(initial);
    setCompletedCrop(initial);
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !completedCrop) return;

    // Convert the percentage-based crop to natural-image pixel coordinates
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const cropUnit = completedCrop.unit === '%'
      ? {
        x: (completedCrop.x / 100) * img.width,
        y: (completedCrop.y / 100) * img.height,
        width: (completedCrop.width / 100) * img.width,
        height: (completedCrop.height / 100) * img.height,
      }
      : completedCrop;

    onConfirm({
      x: Math.round(cropUnit.x * scaleX),
      y: Math.round(cropUnit.y * scaleY),
      width: Math.round(cropUnit.width * scaleX),
      height: Math.round(cropUnit.height * scaleY),
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="Crop Image"
      centered
      size="xl"
      closeOnClickOutside={!isSubmitting}
      closeOnEscape={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Drag the handles to freely resize and reposition the crop area.
        </Text>

        <Box
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
            overflow: 'hidden',
            maxHeight: 420,
          }}
        >
          {sourceUrl && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              ruleOfThirds
              style={{ maxHeight: 420 }}
            >
              <img
                ref={imgRef}
                src={sourceUrl}
                alt="Crop preview"
                onLoad={handleImageLoad}
                style={{ maxHeight: 420, maxWidth: '100%', display: 'block' }}
              />
            </ReactCrop>
          )}
        </Box>

        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!completedCrop} loading={isSubmitting}>
            Confirm Crop
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
