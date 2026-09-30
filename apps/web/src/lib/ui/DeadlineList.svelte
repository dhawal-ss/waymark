<script lang="ts">
  import type { Deadline, LocalDate } from '@waymark/core';
  import { deleteDeadline, updateDeadline } from '../actions';
  import { formatShortDate, relativeDays } from '../format';
  import { store } from '../stores/data.svelte';
  import { casePath } from '../stores/router.svelte';
  import { openSheet } from '../stores/ui.svelte';
  import IconButton from './IconButton.svelte';

  interface Props {
    deadlines: Deadline[];
    today: LocalDate;
    /** Show which case each deadline belongs to. */
    showCase?: boolean;
  }

  let { deadlines, today, showCase = true }: Props = $props();

  const sorted = $derived(
    [...deadlines].sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date)),
  );
  const caseLabel = (id?: string) => {
    const c = id ? store.data.cases.find((x) => x.id === id) : undefined;
    return c ? { id: c.id, text: `${c.form}${c.owner ? `, ${c.owner}` : ''}` } : null;
  };
</script>

<ul class="list" role="list">
  {#each sorted as d (d.id)}
    {@const overdue = !d.done && d.date < today}
    {@const linked = showCase ? caseLabel(d.caseId) : null}
    <li class:done={d.done}>
      <label class="check">
        <input
          type="checkbox"
          checked={d.done}
          aria-label="Done: {d.title}"
          onchange={(e) =>
            updateDeadline(d.id, { done: (e.currentTarget as HTMLInputElement).checked })}
        />
      </label>
      <div class="body">
        <span class="t-body title">{d.title}</span>
        <span class="t-small meta">
          <span class:overdue
            >{formatShortDate(d.date, today)}, {overdue
              ? `overdue, ${relativeDays(d.date, today)}`
              : relativeDays(d.date, today)}</span
          >
          {#if linked}<a href={casePath(linked.id)}>{linked.text}</a>{/if}
        </span>
      </div>
      <IconButton
        icon="edit"
        label="Edit deadline: {d.title}"
        onclick={() => openSheet({ kind: 'deadline', deadlineId: d.id })}
      />
      <IconButton
        icon="delete"
        label="Delete deadline: {d.title}"
        onclick={() => deleteDeadline(d.id)}
      />
    </li>
  {/each}
</ul>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 64px;
    padding: 4px 4px 4px 0;
    border-radius: var(--shape-m);
    background: var(--surface-container-low);
  }
  .check {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex: none;
    cursor: pointer;
  }
  .check input {
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--primary);
    cursor: pointer;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    overflow-wrap: anywhere;
  }
  .done .title {
    text-decoration: line-through;
    color: var(--on-surface-variant);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
    color: var(--on-surface-variant);
  }
  .overdue {
    color: var(--error);
    font-weight: 600;
  }
</style>
