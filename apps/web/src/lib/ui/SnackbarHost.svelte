<script lang="ts">
  import { dismissSnackbar, snackbar } from '../stores/snackbar.svelte';
  import IconButton from './IconButton.svelte';

  let paused = $state(false);
  let el: HTMLDivElement | undefined = $state();

  // Floating buttons move up by this much so the snackbar never covers them.
  $effect(() => {
    const root = document.documentElement.style;
    if (!el) {
      root.setProperty('--snackbar-offset', '0px');
      return;
    }
    const node = el;
    const observer = new ResizeObserver(() =>
      root.setProperty('--snackbar-offset', `${node.offsetHeight + 8}px`),
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.setProperty('--snackbar-offset', '0px');
    };
  });

  $effect(() => {
    const message = snackbar.current;
    if (!message || paused) return;
    const timer = setTimeout(() => dismissSnackbar(message.id), message.timeoutMs);
    return () => clearTimeout(timer);
  });

  function runAction() {
    const message = snackbar.current;
    if (!message?.action) return;
    dismissSnackbar(message.id);
    message.action.run();
  }
</script>

<div class="host" role="status" aria-live="polite" aria-atomic="true">
  {#if snackbar.current}
    {#key snackbar.current.id}
      <div
        bind:this={el}
        class="snackbar"
        role="group"
        aria-label="Notification"
        onpointerenter={() => (paused = true)}
        onpointerleave={() => (paused = false)}
        onfocusin={() => (paused = true)}
        onfocusout={() => (paused = false)}
      >
        <p>{snackbar.current.text}</p>
        {#if snackbar.current.action}
          <button type="button" class="action" onclick={runAction}>
            {snackbar.current.action.label}
          </button>
        {/if}
        <IconButton
          icon="close"
          label="Dismiss notification"
          class="dismiss"
          onclick={() => dismissSnackbar()}
        />
      </div>
    {/key}
  {/if}
</div>

<style>
  .host {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-bar-height) + 12px + env(safe-area-inset-bottom));
    z-index: 40;
    display: flex;
    justify-content: center;
    padding: 0 12px;
    pointer-events: none;
  }
  @media (min-width: 840px) {
    .host {
      left: var(--nav-rail-width);
      bottom: 24px;
    }
  }
  .snackbar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    max-width: 560px;
    min-height: 48px;
    padding: 4px 4px 4px 16px;
    border-radius: var(--shape-s);
    background: var(--inverse-surface);
    color: var(--inverse-on-surface);
    box-shadow: var(--elevation-3);
    animation: in var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  p {
    flex: 1;
    padding: 10px 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
  .action {
    flex: none;
    height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: 20px;
    background: transparent;
    color: var(--inverse-primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  @media (hover: hover) {
    .action:hover {
      background: color-mix(in srgb, var(--inverse-primary) 10%, transparent);
    }
  }
  .action:focus-visible {
    outline-color: var(--inverse-primary);
  }
  .snackbar :global(.dismiss) {
    color: var(--inverse-on-surface);
  }
  .snackbar :global(.dismiss:focus-visible) {
    outline-color: var(--inverse-primary);
  }
  @keyframes in {
    from {
      opacity: 0;
      translate: 0 24px;
    }
  }
</style>
