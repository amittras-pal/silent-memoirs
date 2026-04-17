import { Badge, Tooltip } from '@mantine/core';
import { useEffect, useState } from 'react';

import { SESSION_REFRESH_TARGET_MS, useSessionManager } from './SessionManager';

export function SessionTimerWidget() {
  const { tokenIssuedAt } = useSessionManager();
  const [renderedRemainingSeconds, setRenderedRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!tokenIssuedAt) {
      setRenderedRemainingSeconds(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const targetTime = tokenIssuedAt + SESSION_REFRESH_TARGET_MS;
      const msRemaining = targetTime - now;

      // Show timer only if remaining time is <= 10 minutes (600,000 ms)
      if (msRemaining <= 10 * 60 * 1000 && msRemaining > 0) {
        setRenderedRemainingSeconds(Math.ceil(msRemaining / 1000));
      } else if (msRemaining <= 0 && msRemaining > -60000) {
        // keep showing 0 for up to a minute while refreshing happens
        setRenderedRemainingSeconds(0);
      } else {
        setRenderedRemainingSeconds(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [tokenIssuedAt]);

  if (renderedRemainingSeconds === null) return null;

  const m = Math.floor(renderedRemainingSeconds / 60).toString().padStart(2, '0');
  const s = (renderedRemainingSeconds % 60).toString().padStart(2, '0');

  return (
    <Tooltip label="Time remaining until the app attempts to securely renew your Google Drive session.">
      <Badge
        size="md"
        radius="xl"
        color={renderedRemainingSeconds < 60 ? 'red' : 'orange'}
        variant='dot'
        style={{ cursor: 'help' }}
      >
        {m === "00" && s === "00" ? "Session Refresh Required" : `Session ends in ${m}:${s}`}
      </Badge>
    </Tooltip>
  );
}
