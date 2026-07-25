import { useEffect } from 'react';

const MIGRATION_KEY = 'planyx-police-directory-cache-migration-v3';
const LEGACY_PREFIX = 'planyx-police-stations-server-v2:';

export default function PoliceDirectoryCacheMigration() {
  useEffect(() => {
    try {
      if (localStorage.getItem(MIGRATION_KEY)) return;
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
      }
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
    } catch {
      // The directory still works without local storage; this only removes stale empty results.
    }
  }, []);

  return null;
}
