/** UI preferences only; the authenticated workspace itself is saved on the server. */
const fallback = new Map<string, string | null>();

export const browserStorage = {
  get(key: string): string | null {
    if (fallback.has(key)) return fallback.get(key) ?? null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      // Restricted/private browser contexts can deny access to storage.
      fallback.set(key, value);
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
      fallback.delete(key);
    } catch {
      fallback.set(key, null);
    }
  },
};
