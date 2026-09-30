export interface SnackbarAction {
  label: string;
  run: () => void;
}

export interface SnackbarMessage {
  id: number;
  text: string;
  action?: SnackbarAction;
  timeoutMs: number;
}

let nextId = 1;

export const snackbar: { current: SnackbarMessage | null } = $state({ current: null });

/**
 * Show a message, replacing any current one so the newest result and its undo are always
 * visible. Messages with an action stay longer so there is time to use it.
 */
export function showSnackbar(text: string, action?: SnackbarAction, timeoutMs?: number): number {
  const message: SnackbarMessage = {
    id: nextId++,
    text,
    ...(action ? { action } : {}),
    timeoutMs: timeoutMs ?? (action ? 8000 : 5000),
  };
  snackbar.current = message;
  return message.id;
}

/** Dismiss the current message, or only the message with `id` if it is still showing. */
export function dismissSnackbar(id?: number): void {
  if (id !== undefined && snackbar.current?.id !== id) return;
  snackbar.current = null;
}
