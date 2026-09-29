<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props {
    icon: IconName;
    title: string;
    body: string;
    actions?: Snippet;
  }

  let { icon, title, body, actions }: Props = $props();
</script>

<section class="empty">
  <span class="icon"><Icon name={icon} size={32} /></span>
  <h2 class="t-headline">{title}</h2>
  <p class="muted">{body}</p>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</section>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 32px 24px;
    border-radius: var(--shape-2xl) var(--shape-l) var(--shape-2xl) var(--shape-l);
    background: var(--surface-container-low);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: var(--shape-l);
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
  p {
    max-width: 52ch;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
</style>
