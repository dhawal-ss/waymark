<script lang="ts">
  import { FORM_NAMES, localDateOf, type FormType } from '@waymark/core';
  import { formatDate, relativeTime } from '../lib/format';
  import { mutate, nowInstant, store, tz } from '../lib/stores/data.svelte';
  import { formPageUrl, GROUP_LABELS, SOURCES, type SourceGroup } from '../lib/sources';
  import Button from '../lib/ui/Button.svelte';
  import FilterChip from '../lib/ui/FilterChip.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';

  const GROUPS = Object.keys(GROUP_LABELS) as SourceGroup[];
  let shown = $state<SourceGroup[]>([...GROUPS]);
  const visible = $derived(SOURCES.filter((s) => shown.includes(s.group)));
  const forms = $derived(
    [...new Set(store.data.cases.map((c) => c.form))]
      .filter((f): f is Exclude<FormType, 'Other'> => f !== 'Other')
      .sort(),
  );

  function markChecked(id: string, name: string) {
    mutate((d) => (d.sourceChecks[id] = nowInstant()), { message: `Marked ${name} as checked.` });
  }
</script>

<PageHeader title="Updates" />

<p class="muted intro">
  Official sources to check for changes. Waymark does not fetch these pages; mark each one after you
  read it to track when you last looked.
</p>

{#if forms.length > 0}
  <section class="relevant" aria-labelledby="relevant-title">
    <h2 id="relevant-title" class="t-title">Relevant to your forms</h2>
    <ul role="list">
      {#each forms as f (f)}
        <li>
          <a href={formPageUrl(f)} target="_blank" rel="noopener noreferrer">{f}, {FORM_NAMES[f]}</a
          >
        </li>
      {/each}
    </ul>
    <p class="t-small">Form pages list the current edition, filing fee, and where to file.</p>
  </section>
{/if}

<div class="chips" role="group" aria-label="Source groups">
  {#each GROUPS as g (g)}
    <FilterChip
      label={GROUP_LABELS[g]}
      selected={shown.includes(g)}
      onchange={(on) => (shown = on ? [...shown, g] : shown.filter((x) => x !== g))}
    />
  {/each}
</div>

{#if visible.length === 0}
  <p class="muted">No groups selected. Select a chip to show sources.</p>
{:else}
  <ul class="sources" role="list">
    {#each visible as s (s.id)}
      {@const checked = store.data.sourceChecks[s.id]}
      <li>
        <div class="text">
          <a class="t-title" href={s.url} target="_blank" rel="noopener noreferrer">
            {s.name}<Icon name="open_in_new" size={16} /><span class="visually-hidden">
              (opens in a new tab)</span
            >
          </a>
          <span class="t-small muted">{s.description}</span>
          <span class="t-small">
            {GROUP_LABELS[s.group]}.
            {#if checked}
              Checked {relativeTime(checked)} ({formatDate(localDateOf(checked, tz()))}).
            {:else}
              Not checked yet.
            {/if}
          </span>
        </div>
        <Button
          variant="outlined"
          icon="check"
          onclick={() => markChecked(s.id, s.name)}
          aria-label="Mark as checked: {s.name}"
        >
          Mark as checked
        </Button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro {
    max-width: 60ch;
    margin-bottom: 16px;
  }
  .relevant {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    padding: 20px;
    border-radius: var(--shape-2xl) var(--shape-l) var(--shape-2xl) var(--shape-l);
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .relevant ul {
    margin: 0;
    padding-left: 20px;
  }
  .relevant a {
    color: inherit;
    font-weight: 600;
    display: inline-block;
    padding: 4px 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .sources {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .sources li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: var(--shape-l);
    background: var(--surface-container-low);
  }
  .text {
    flex: 1 1 240px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .text a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--on-surface);
    text-decoration-color: var(--outline);
  }
</style>
