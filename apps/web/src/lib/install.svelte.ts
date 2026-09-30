// Install to home screen. Chrome on Android fires beforeinstallprompt when the app can be
// installed; the prompt must be shown from a user gesture.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const install: { available: boolean; installed: boolean } = $state({
  available: false,
  installed: false,
});

let deferred: InstallPromptEvent | null = null;

export function startInstallWatch(): void {
  install.installed =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    install.available = true;
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    install.available = false;
    install.installed = true;
  });
}

/** Show the browser's install prompt. Returns true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  install.available = false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}
