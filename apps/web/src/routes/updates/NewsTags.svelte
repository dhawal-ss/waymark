<script lang="ts">
  import type { NewsItem } from '@waymark/core';
  import Icon from '../../lib/ui/Icon.svelte';

  interface Props {
    item: NewsItem;
    /** Forms in the item that match the user's cases. */
    matches: string[];
  }

  let { item, matches }: Props = $props();
</script>

{#if item.forms.length > 0}
  <ul class="tags" role="list" aria-label="Forms and relevance">
    {#if matches.length > 0}
      <li class="mine"><Icon name="folder_fill" size={16} />For your cases</li>
    {/if}
    {#each item.forms as form (form)}
      <li class="form" class:match={matches.includes(form)}>
        <span class="visually-hidden">Form </span>{form}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: var(--shape-full);
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .mine {
    padding-left: 10px;
    background: var(--news-fg);
    color: var(--news-bg);
  }
  .form {
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--news-fg) 60%, transparent);
    color: var(--news-fg);
    font-variant-numeric: tabular-nums;
  }
  .match {
    box-shadow: inset 0 0 0 2.5px var(--news-fg);
    font-weight: 720;
  }
  @media (forced-colors: active) {
    .mine {
      border: 2px solid CanvasText;
    }
    .form {
      border: 1px solid CanvasText;
    }
  }
</style>
