<script lang="ts">
  import { tick } from 'svelte';
  import { applyTheme } from './lib/theme';
  import { initServerSync } from './lib/serverSync.svelte';
  import { initData, store, tz } from './lib/stores/data.svelte';
  import { refreshClock, startClock } from './lib/stores/clock.svelte';
  import { startInstallWatch } from './lib/install.svelte';
  import { initBackup } from './lib/backup.svelte';
  import { handleLaunch } from './lib/launch';
  import { router, startRouter } from './lib/stores/router.svelte';
  import AppNav from './lib/ui/AppNav.svelte';
  import LoadingIndicator from './lib/ui/LoadingIndicator.svelte';
  import SnackbarHost from './lib/ui/SnackbarHost.svelte';
  import SheetHost from './lib/sheets/SheetHost.svelte';
  import Cases from './routes/Cases.svelte';
  import type { Component } from 'svelte';

  // Pages other than Cases load on demand to keep the first load small.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loadRoute(name: string): Promise<{ default: Component<any> }> {
    switch (name) {
      case 'case':
        return import('./routes/CaseDetail.svelte');
      case 'insights':
        return import('./routes/Insights.svelte');
      case 'updates':
        return import('./routes/Updates.svelte');
      case 'tools':
        return import('./routes/Tools.svelte');
      case 'settings':
        return import('./routes/Settings.svelte');
      default:
        return import('./routes/DesignSystem.svelte');
    }
  }

  const route = $derived(router.route);

  const prefs = $derived(store.data.prefs);

  $effect(() => startRouter());
  $effect(() => {
    void initData().then(() => {
      startClock(() => tz());
      startInstallWatch();
      void initBackup();
      void handleLaunch();
      return initServerSync();
    });
  });

  $effect(() => {
    applyTheme({ seed: prefs.seed, mode: prefs.theme, highContrast: prefs.highContrast });
  });

  $effect(() => {
    void prefs.timeZone;
    refreshClock();
  });

  $effect(() => {
    if (prefs.theme !== 'system') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () =>
      applyTheme({ seed: prefs.seed, mode: prefs.theme, highContrast: prefs.highContrast });
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  // Move focus to the new page heading after navigation, but not on first load.
  let firstRoute = true;
  $effect(() => {
    void router.route.path;
    if (firstRoute) {
      firstRoute = false;
      return;
    }
    window.scrollTo(0, 0);
    // Lazy pages render their heading a little later, so wait for it for up to about a second.
    let frames = 0;
    let frame = 0;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) heading.focus({ preventScroll: true });
      else if (frames++ < 60) frame = requestAnimationFrame(focusHeading);
    };
    tick().then(focusHeading);
    return () => cancelAnimationFrame(frame);
  });
</script>

<a
  class="skip"
  href="#main"
  onclick={(e) => {
    e.preventDefault();
    document.getElementById('main')?.focus();
  }}>Skip to content</a
>

<AppNav current={router.route.name} />

<main id="main" tabindex="-1">
  {#if !store.ready}
    <div class="loading"><LoadingIndicator label="Loading your data" /></div>
  {:else if route.name === 'cases'}
    <Cases />
  {:else}
    {#await loadRoute(route.name)}
      <div class="loading"><LoadingIndicator label="Loading page" /></div>
    {:then module}
      {#if route.name === 'case'}
        {#key route.id}<module.default id={route.id ?? ''} />{/key}
      {:else}
        <module.default />
      {/if}
    {:catch}
      <p class="error" role="alert">
        This page failed to load. Check your connection, then reload.
      </p>
    {/await}
  {/if}
</main>

<footer class="t-small muted">
  Stored on this device only. Not legal advice. Not affiliated with USCIS.
</footer>

{#if store.ready}<SheetHost />{/if}
<SnackbarHost />

<style>
  .skip {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 100;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 600;
    translate: 0 -200%;
  }
  .skip:focus {
    translate: 0 0;
  }
  main,
  footer {
    width: 100%;
    max-width: var(--content-max);
    margin: 0 auto;
    padding-left: max(var(--gutter), env(safe-area-inset-left));
    padding-right: max(var(--gutter), env(safe-area-inset-right));
  }
  main {
    min-height: calc(100dvh - var(--nav-bar-height) - 56px);
    padding-bottom: 24px;
  }
  main:focus {
    outline: none;
  }
  footer {
    padding-top: 16px;
    padding-bottom: calc(
      var(--nav-bar-height) + 16px + var(--floating-space, 0px) + env(safe-area-inset-bottom)
    );
  }
  @media (min-width: 600px) {
    :global(:root) {
      --gutter: 24px;
    }
  }
  @media (min-width: 840px) {
    main,
    footer {
      margin-left: calc(
        var(--nav-rail-width) + max(0px, (100vw - var(--nav-rail-width) - var(--content-max)) / 2)
      );
    }
    main {
      min-height: calc(100dvh - 56px);
    }
    footer {
      padding-bottom: calc(24px + var(--floating-space, 0px));
    }
  }
  .loading {
    display: grid;
    place-items: center;
    padding: 64px 0;
  }
  .error {
    padding: 24px 0;
    color: var(--error);
  }
</style>
