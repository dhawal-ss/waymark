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

export const snackbar: { current: SnackbarMessage | null; queue: SnackbarMessage[] } = $state({
  current: null,
  queue: [],
});

/** Show a message. Messages with an action stay longer so there is time to use it. */
export function showSnackbar(text: string, action?: SnackbarAction, timeoutMs?: number): number {
  const message: SnackbarMessage = {
    id: nextId++,
    text,
    ...(action ? { action } : {}),
    timeoutMs: timeoutMs ?? (action ? 8000 : 5000),
  };
  if (snackbar.current) snackbar.queue.push(message);
  else snackbar.current = message;
  return message.id;
}

export function dismissSnackbar(id?: number): void {
  if (id !== undefined && snackbar.current?.id !== id) {
    snackbar.queue = snackbar.queue.filter((m) => m.id !== id);
    return;
  }
  snackbar.current = snackbar.queue.shift() ?? null;
}
