<script lang="ts">
  import { onMount } from 'svelte';
  import { FORM_NAMES, localDateOf, type FormType } from '@waymark/core';
  import { formatDate, relativeTime } from '../lib/format';
  import { publicDataOn } from '../lib/publicData';
  import { serverSync } from '../lib/serverSync.svelte';
  import {
    loadSetting,
    mutate,
    nowInstant,
    saveSetting,
    store,
    tz,
  } from '../lib/stores/data.svelte';
  import { updatePrefs } from '../lib/stores/prefs.svelte';
  import { formPageUrl, GROUP_LABELS, SOURCES, type SourceGroup } from '../lib/sources';
  import Button from '../lib/ui/Button.svelte';
  import ButtonGroup from '../lib/ui/ButtonGroup.svelte';
  import EmptyState from '../lib/ui/EmptyState.svelte';
  import FilterChip from '../lib/ui/FilterChip.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import LoadingIndicator from '../lib/ui/LoadingIndicator.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';

  type View = 'feed' | 'sources';
  type Mode = 'cards' | 'list';

  // The feed is the default when public data is on. Otherwise sources are, with an offer to turn
  // on public data. The default follows public data until the person picks a view, because the
  // saved server address can load a moment after this page opens.
  let chosen = $state<View | null>(null);
  const view = $derived<View>(chosen ?? (publicDataOn() ? 'feed' : 'sources'));
  let mode = $state<Mode>('cards');
  // The feed waits for the saved card or list choice, so it does not switch view after it shows.
  let modeLoaded = $state(false);
  const NEWS_VIEW_SETTING = 'newsView';

  onMount(() => {
    void loadSetting<Mode>(NEWS_VIEW_SETTING).then((saved) => {
      if (saved === 'list') mode = 'list';
      modeLoaded = true;
    });
  });

  function setMode(next: Mode) {
    mode = next;
    void saveSetting(NEWS_VIEW_SETTING, next);
  }

  // Public data needs a sync server address. With one saved, it can be turned on here.
  const canTurnOn = $derived(Boolean(serverSync.url));
  function turnOnPublicData() {
    updatePrefs({ publicData: true });
    chosen = 'feed';
  }

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

<div class="bar">
  <div class="switch">
    <ButtonGroup
      label="Updates view"
      options={[
        { value: 'feed', label: 'Feed' },
        { value: 'sources', label: 'Sources' },
      ]}
      value={view}
      onchange={(v) => (chosen = v)}
    />
  </div>
  {#if view === 'feed' && publicDataOn()}
    <FilterChip
      label="List view"
      selected={mode === 'list'}
      onchange={(on) => setMode(on ? 'list' : 'cards')}
    />
  {/if}
</div>

{#snippet offerActions()}
  {#if canTurnOn}
    <Button icon="check" onclick={turnOnPublicData}>Turn on public data</Button>
  {:else}
    <Button href="#/settings" icon="settings">Open Settings</Button>
  {/if}
{/snippet}

{#if view === 'feed'}
  {#if !publicDataOn()}
    <EmptyState
      icon="newspaper"
      title="Public data is off"
      body={canTurnOn
        ? 'Turn on public data to load new rules, notices, and news releases from USCIS and the Federal Register. Requests do not include your cases or forms.'
        : 'The feed loads from a sync server, and no server address is set. Enter the address in Settings under Automatic checks, then turn on public data.'}
    >
      {#snippet actions()}
        {@render offerActions()}
        <Button variant="outlined" onclick={() => (chosen = 'sources')}
          >Show official sources</Button
        >
      {/snippet}
    </EmptyState>
  {:else if modeLoaded}
    {#await import('./updates/NewsFeed.svelte')}
      <div class="loading"><LoadingIndicator label="Loading updates" /></div>
    {:then feed}
      <feed.default {mode} onsources={() => (chosen = 'sources')} />
    {:catch}
      <p class="error" role="alert">
        The feed failed to load. Check your connection, then reload the page.
      </p>
    {/await}
  {/if}
{:else}
  {@render sourcesView()}
{/if}

{#snippet sourcesView()}
  {#if !publicDataOn()}
    <section class="offer" aria-labelledby="offer-title">
      <h2 id="offer-title" class="t-title">Live feed of official updates</h2>
      <p>
        {#if canTurnOn}
          Turn on public data to load new rules, notices, and news releases from USCIS and the
          Federal Register. Requests do not include your cases or forms.
        {:else}
          The feed of new rules, notices, and news releases loads from a sync server. Enter its
          address in Settings under Automatic checks, then turn on public data.
        {/if}
      </p>
      <div class="offer-actions">{@render offerActions()}</div>
    </section>
  {/if}

  <p class="muted intro">
    Official sources to check for changes. Waymark does not fetch these pages; mark each one after
    you read it to track when you last looked.
  </p>

  {#if forms.length > 0}
    <section class="relevant" aria-labelledby="relevant-title">
      <h2 id="relevant-title" class="t-title">Relevant to your forms</h2>
      <ul role="list">
        {#each forms as f (f)}
          <li>
            <a href={formPageUrl(f)} target="_blank" rel="noopener noreferrer"
              >{f}, {FORM_NAMES[f]}</a
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
{/snippet}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    margin-bottom: 4px;
  }
  .switch {
    flex: 0 0 176px;
  }
  .offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin: 12px 0 16px;
    padding: 20px;
    border-radius: var(--shape-2xl) var(--shape-l) var(--shape-2xl) var(--shape-l);
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .offer p {
    max-width: 60ch;
  }
  .offer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .loading {
    display: grid;
    place-items: center;
    padding: 48px 0;
  }
  .error {
    padding: 24px 0;
    color: var(--error);
  }
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
