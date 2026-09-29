<script lang="ts">
  import { tick } from 'svelte';
  import { applyTheme } from './lib/theme';
  import { prefs } from './lib/stores/prefs.svelte';
  import { router, startRouter } from './lib/stores/router.svelte';
  import AppNav from './lib/ui/AppNav.svelte';
  import LoadingIndicator from './lib/ui/LoadingIndicator.svelte';
  import SnackbarHost from './lib/ui/SnackbarHost.svelte';
  import Placeholder from './routes/Placeholder.svelte';
  import Settings from './routes/Settings.svelte';

  const loadDesignSystem = () => import('./routes/DesignSystem.svelte');

  $effect(() => startRouter());

  $effect(() => {
    applyTheme({ seed: prefs.seed, mode: prefs.theme, highContrast: prefs.highContrast });
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
    tick().then(() =>
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }),
    );
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
  {#if router.route.name === 'cases'}
    <Placeholder
      title="Cases"
      icon="folder"
      missing="Case tracking, USCIS JSON import, and deadlines are part of the next phase. This build contains the app shell and the design system."
    />
  {:else if router.route.name === 'insights'}
    <Placeholder
      title="Insights"
      icon="monitoring"
      missing="Wait bars, processing time series, and priority date projections are part of the next phase."
    />
  {:else if router.route.name === 'updates'}
    <Placeholder
      title="Updates"
      icon="newspaper"
      missing="Official source links and check tracking are part of the next phase."
    />
  {:else if router.route.name === 'tools'}
    <Placeholder
      title="Tools"
      icon="handyman"
      missing="The priority date checker, timeline planner, fee tally, and checklists are part of the next phase."
    />
  {:else if router.route.name === 'settings'}
    <Settings />
  {:else if router.route.name === 'design'}
    {#await loadDesignSystem()}
      <div class="loading"><LoadingIndicator label="Loading design system" /></div>
    {:then module}
      <module.default />
    {:catch}
      <p class="error">
        The design system page failed to load. Check your connection, then reload.
      </p>
    {/await}
  {/if}
</main>

<footer class="t-small muted">
  Stored on this device only. Not legal advice. Not affiliated with USCIS.
</footer>

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
    padding-bottom: calc(var(--nav-bar-height) + 16px + env(safe-area-inset-bottom));
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
      padding-bottom: 24px;
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
