// Which sheet is open. One sheet at a time, opened from anywhere.
import type { StatusKey } from '@waymark/core';

export type SheetRequest =
  | { kind: 'case'; caseId?: string }
  | { kind: 'deadline'; caseId?: string; deadlineId?: string }
  | { kind: 'import'; caseId?: string; message?: string; text?: string }
  | { kind: 'status'; caseId: string; status?: StatusKey };

export const ui: { sheet: SheetRequest | null } = $state({ sheet: null });

let returnFocus: HTMLElement | null = null;

export function openSheet(request: SheetRequest): void {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.sheet = request;
}

export function closeSheet(): void {
  ui.sheet = null;
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) queueMicrotask(() => target.focus());
}
