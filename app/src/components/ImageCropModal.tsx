import { Button, Group, Modal, Slider, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { PixelCrop } from '../lib/media';

interface ImageCropModalProps {
  opened: boolean;
  sourceUrl: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (crop: PixelCrop) => void;
}

export function ImageCropModal({ opened, sourceUrl, isSubmitting, onCancel, onConfirm }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<PixelCrop | null>(null);

  useEffect(() => {
    if (!opened) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropPixels(null);
  }, [opened, sourceUrl]);

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCropPixels({
      x: areaPixels.x,
      y: areaPixels.y,
      width: areaPixels.width,
      height: areaPixels.height,
    });
  };

  const handleConfirm = () => {
    if (!cropPixels) return;
    onConfirm(cropPixels);
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
          Adjust the crop area, then confirm to continue upload.
        </Text>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 360,
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {sourceUrl && (
            <Cropper
              image={sourceUrl}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={4}
              zoomSpeed={0.2}
              aspect={4 / 3}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              objectFit="contain"
              showGrid={false}
            />
          )}
        </div>

        <Stack gap={6}>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">Zoom</Text>
            <Text size="xs" c="dimmed">{zoom.toFixed(2)}x</Text>
          </Group>
          <Slider
            value={zoom}
            min={1}
            max={4}
            step={0.05}
            onChange={setZoom}
            label={null}
          />
        </Stack>

        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!cropPixels} loading={isSubmitting}>
            Confirm Crop
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
