<script lang="ts">
  import { isClosed, sortCases, waitPosition } from '@waymark/core';
  import { todayLocal } from '../../lib/actions';
  import { plural } from '../../lib/format';
  import { store, tz } from '../../lib/stores/data.svelte';
  import { casePath } from '../../lib/stores/router.svelte';
  import WavyProgress from '../../lib/ui/WavyProgress.svelte';

  const today = $derived(todayLocal());
  const open = $derived(sortCases(store.data.cases, today, tz()).filter((c) => !isClosed(c, tz())));
  const withTime = $derived(
    open.map((c) => ({ c, wait: waitPosition(c, today) })).filter((x) => x.wait),
  );
  const missing = $derived(open.filter((c) => !c.processingMonths));
</script>

<section class="panel" aria-labelledby="wait-title">
  <h2 id="wait-title" class="t-headline">Wait against processing time</h2>
  {#if open.length === 0}
    <p class="muted">
      No open cases. Add a case on the Cases tab to compare its wait with the published processing
      time.
    </p>
  {:else}
    {#if withTime.length > 0}
      <ul class="bars" role="list">
        {#each withTime as { c, wait } (c.id)}
          {#if wait}
            <li>
              <div class="label">
                <a href={casePath(c.id)} class="t-label">{c.form}{c.owner ? `, ${c.owner}` : ''}</a>
                <span class="t-small" class:over={wait.remaining < 0}>
                  {wait.remaining >= 0
                    ? `${wait.elapsed} of ${wait.total} days`
                    : `${plural(-wait.remaining, 'day')} over`}
                </span>
              </div>
              <WavyProgress
                value={wait.elapsed}
                max={wait.total}
                label="{c.form}{c.owner
                  ? ` for ${c.owner}`
                  : ''}: days since filing against processing time"
                valueText="{wait.elapsed} of {wait.total} days"
              />
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
    {#if missing.length > 0}
      <p class="t-small muted">
        {plural(missing.length, 'open case has', 'open cases have')} no processing time:
        {#each missing as c, i (c.id)}<a href={casePath(c.id)}
            >{c.form}{c.owner ? `, ${c.owner}` : ''}</a
          >{i < missing.length - 1 ? '; ' : '.'}{/each}
        Open the case and enter the time under Where you sit.
      </p>
    {/if}
  {/if}
</section>

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
  }
  .label {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .over {
    color: var(--error);
    font-weight: 600;
  }
</style>
