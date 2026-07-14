import { useEffect, useState } from 'react';

function getInitialOnlineStatus(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true;
  }

  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus);

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !('addEventListener' in globalThis)) {
      return undefined;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
