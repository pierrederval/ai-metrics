'use client';
import { useEffect, useState } from 'react';
import type { ImportSnapshot } from '../../domain/import/types';
import { startPolling, type Connection } from './polling';
export function useImportStatus(initial: ImportSnapshot) {
  const [value, setValue] = useState<{ snapshot: ImportSnapshot; connection: Connection }>({
    snapshot: initial,
    connection: 'connected',
  });
  useEffect(() => {
    setValue({ snapshot: initial, connection: 'connected' });
    return startPolling(initial, (snapshot, connection) => setValue({ snapshot, connection }), {
      fetch: window.fetch.bind(window),
      hidden: () => document.visibilityState === 'hidden',
      subscribe: (listener) => {
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
      },
    });
    // A persisted run is immutable as an identity; polling owns subsequent snapshots.
  }, [initial.id]);
  return value;
}
