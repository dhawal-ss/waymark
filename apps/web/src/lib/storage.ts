// Small synchronous key-value helpers over localStorage. Failures are silent because
// private browsing or disabled storage must not break the app.

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable.
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable.
  }
}
