// The current local date, kept fresh while the app stays open (past midnight, after the phone
// sleeps, or when the time zone setting changes).
import { today } from '@waymark/core';

export const clock: { day: string } = $state({ day: today() });

let zone: () => string | undefined = () => undefined;

function refresh(): void {
  const next = today(zone());
  if (next !== clock.day) clock.day = next;
}

/** Start updating. `timeZone` returns the current override, or undefined for the device zone. */
export function startClock(timeZone: () => string | undefined): () => void {
  zone = timeZone;
  refresh();
  const timer = setInterval(refresh, 60_000);
  const onVisible = () => document.visibilityState === 'visible' && refresh();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Recompute now, for example after the time zone setting changes. */
export function refreshClock(): void {
  refresh();
}
