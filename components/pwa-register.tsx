'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    )
      return;
    const serviceWorkerUrl = new URL('sw.js', window.location.href).pathname;
    void navigator.serviceWorker.register(serviceWorkerUrl);
  }, []);

  return null;
}
