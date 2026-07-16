"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const disableServiceWorker = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("northstar-")).map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn("NorthStar service worker cleanup failed", error);
      }
    };

    void disableServiceWorker();
  }, []);

  return null;
}
