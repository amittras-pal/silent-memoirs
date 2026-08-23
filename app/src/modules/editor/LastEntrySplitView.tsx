import { Box, Tooltip } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './LastEntrySplitView.css';

interface LastEntrySplitViewProps {
  editorNode: ReactNode;
  viewerNode: ReactNode;
  minEditorWidthPx?: number;
  minViewerWidthPx?: number;
}

const DEFAULT_VIEWER_PERCENTAGE = 45;

export function LastEntrySplitView({
  editorNode,
  viewerNode,
  minEditorWidthPx = 340,
  minViewerWidthPx = 280,
}: LastEntrySplitViewProps) {
  // Store viewer width percentage in localStorage
  const [viewerPercentage, setViewerPercentage] = useLocalStorage<number>({
    key: 'silent-memoirs:editor-split-ratio',
    defaultValue: DEFAULT_VIEWER_PERCENTAGE,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, []);

  const handleDoubleClick = useCallback(() => {
    setViewerPercentage(DEFAULT_VIEWER_PERCENTAGE);
  }, [setViewerPercentage]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      if (containerWidth <= 0) return;

      // Pointer position relative to container
      const pointerX = e.clientX - containerRect.left;
      const editorWidth = pointerX;
      const viewerWidth = containerWidth - pointerX;

      // Boundaries clamping
      if (editorWidth < minEditorWidthPx || viewerWidth < minViewerWidthPx) {
        return;
      }

      const calculatedViewerPercentage = (viewerWidth / containerWidth) * 100;
      // Clamp between 20% and 65%
      const clampedPercentage = Math.min(65, Math.max(20, calculatedViewerPercentage));

      setViewerPercentage(clampedPercentage);
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [minEditorWidthPx, minViewerWidthPx, setViewerPercentage]);

  const editorPercentage = 100 - viewerPercentage;

  return (
    <Box ref={containerRef} className="last-entry-split-container">
      <Box
        className="last-entry-split-editor"
        style={{
          width: `calc(${editorPercentage}% - 4px)`,
          minWidth: minEditorWidthPx,
        }}
      >
        {editorNode}
      </Box>

      <Tooltip
        label="Drag to resize (double-click to reset)"
        openDelay={600}
        position="top"
        withArrow
      >
        <Box
          className={`last-entry-split-gutter ${isDragging ? 'is-dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <Box className="last-entry-split-gutter-handle" />
        </Box>
      </Tooltip>

      <Box
        className="last-entry-split-viewer"
        style={{
          width: `calc(${viewerPercentage}% - 4px)`,
          minWidth: minViewerWidthPx,
        }}
      >
        {viewerNode}
      </Box>
    </Box>
  );
}
