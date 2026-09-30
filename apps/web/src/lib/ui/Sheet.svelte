<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  interface Props {
    open: boolean;
    title: string;
    /** Called when the sheet asks to close: Escape, scrim click, or the close button. */
    onclose: () => void;
    children: Snippet;
    actions?: Snippet;
  }

  let { open, title, onclose, children, actions }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // A sheet can name the field to start in; otherwise the dialog focuses its first control.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) dialog.close();
  });

  function oncancel(event: Event) {
    event.preventDefault();
    onclose();
  }

  function onclick(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} {oncancel} {onclick}>
  <div class="sheet">
    <div class="handle" aria-hidden="true"></div>
    <header>
      <h2 id={titleId} class="t-headline">{title}</h2>
      <IconButton icon="close" label="Close" onclick={onclose} />
    </header>
    <div class="body">
      {@render children()}
    </div>
    {#if actions}
      <footer>{@render actions()}</footer>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    --radius: var(--shape-xl);
    width: 100%;
    max-width: 100%;
    max-height: min(92dvh, 100%);
    margin: auto 0 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--surface-container-low);
    color: var(--on-surface);
    box-shadow: var(--elevation-3);
    overflow: hidden;
    transition:
      translate var(--spring-default-spatial-duration) var(--spring-default-spatial),
      opacity var(--duration-medium) var(--ease-standard),
      overlay var(--duration-medium) allow-discrete,
      display var(--duration-medium) allow-discrete;
  }
  dialog[open] {
    display: flex;
    translate: 0 0;
    opacity: 1;
  }
  dialog:not([open]) {
    translate: 0 100%;
  }
  @starting-style {
    dialog[open] {
      translate: 0 100%;
    }
  }
  dialog::backdrop {
    background: color-mix(in srgb, var(--scrim) 40%, transparent);
    transition:
      opacity var(--duration-medium) var(--ease-standard),
      overlay var(--duration-medium) allow-discrete,
      display var(--duration-medium) allow-discrete;
  }
  @starting-style {
    dialog[open]::backdrop {
      opacity: 0;
    }
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: inherit;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .handle {
    width: 32px;
    height: 4px;
    margin: 16px auto 4px;
    border-radius: 2px;
    background: var(--on-surface-variant);
    opacity: 0.4;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px 8px 24px;
  }
  .body {
    padding: 8px 24px 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 24px 20px;
    border-top: 1px solid var(--outline-variant);
  }
  @media (min-width: 600px) {
    dialog {
      width: min(560px, calc(100vw - 48px));
      margin: auto;
      border-radius: var(--radius);
      background: var(--surface-container-high);
    }
    dialog:not([open]) {
      translate: 0 24px;
      opacity: 0;
    }
    @starting-style {
      dialog[open] {
        translate: 0 24px;
        opacity: 0;
      }
    }
    .handle {
      display: none;
    }
    header {
      padding-top: 16px;
    }
  }
</style>
