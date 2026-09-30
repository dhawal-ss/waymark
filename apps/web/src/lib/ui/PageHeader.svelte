<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** Link target for a back arrow, for example "#/settings". */
    back?: { href: string; label: string };
    actions?: Snippet;
  }

  let { title, back, actions }: Props = $props();
</script>

<header class="page-header">
  {#if back}
    <a class="back" href={back.href} aria-label={back.label} title={back.label}>
      <Icon name="arrow_back" />
    </a>
  {/if}
  <h1 class="t-page-title" tabindex="-1">{title}</h1>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 64px;
    padding: 16px 0 8px;
  }
  h1 {
    flex: 1;
    min-width: 0;
  }
  h1:focus {
    outline: none;
  }
  .back {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-left: -12px;
    border-radius: 24px;
    color: var(--on-surface);
  }
  @media (hover: hover) {
    .back:hover {
      background: color-mix(in srgb, var(--on-surface) 8%, transparent);
    }
  }
  .actions {
    display: flex;
    gap: 4px;
  }
</style>
