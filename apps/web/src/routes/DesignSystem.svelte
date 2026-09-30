<script lang="ts">
  import { FORM_TYPES, STATUS_KEYS, type Tone } from '@waymark/core';
  import { contrast, ROLE_NAMES, SPRINGS, springCurve, type Role } from '@waymark/theme';
  import { store } from '../lib/stores/data.svelte';
  import { showSnackbar } from '../lib/stores/snackbar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import ButtonGroup from '../lib/ui/ButtonGroup.svelte';
  import Checkbox from '../lib/ui/Checkbox.svelte';
  import FabMenu from '../lib/ui/FabMenu.svelte';
  import FilterChip from '../lib/ui/FilterChip.svelte';
  import FloatingToolbar from '../lib/ui/FloatingToolbar.svelte';
  import FormBadge from '../lib/ui/FormBadge.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import LineChart, { type ChartSeries } from '../lib/ui/LineChart.svelte';
  import LoadingIndicator from '../lib/ui/LoadingIndicator.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import Pill from '../lib/ui/Pill.svelte';
  import Select from '../lib/ui/Select.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';
  import SplitButton from '../lib/ui/SplitButton.svelte';
  import StatusPill from '../lib/ui/StatusPill.svelte';
  import Switch from '../lib/ui/Switch.svelte';
  import TextField from '../lib/ui/TextField.svelte';
  import WavyProgress from '../lib/ui/WavyProgress.svelte';

  const prefs = $derived(store.data.prefs);

  const PAIRS: [Role, Role][] = [
    ['primary', 'on-primary'],
    ['primary-container', 'on-primary-container'],
    ['secondary', 'on-secondary'],
    ['secondary-container', 'on-secondary-container'],
    ['tertiary', 'on-tertiary'],
    ['tertiary-container', 'on-tertiary-container'],
    ['error', 'on-error'],
    ['error-container', 'on-error-container'],
    ['success', 'on-success'],
    ['success-container', 'on-success-container'],
    ['inverse-surface', 'inverse-on-surface'],
  ];
  const SURFACES: Role[] = [
    'surface-dim',
    'surface',
    'surface-bright',
    'surface-container-lowest',
    'surface-container-low',
    'surface-container',
    'surface-container-high',
    'surface-container-highest',
  ];
  const TONES: { tone: Tone; label: string; role: string }[] = [
    { tone: 'progress', label: 'Progress', role: 'primary-container' },
    { tone: 'action', label: 'Action needed', role: 'tertiary-container' },
    { tone: 'good', label: 'Good', role: 'success-container' },
    { tone: 'bad', label: 'Bad', role: 'error-container' },
  ];
  const TYPE_SCALE = [
    { cls: 't-page-title', name: 'Page title', sample: 'Cases' },
    { cls: 't-counter', name: 'Day counter', sample: '212' },
    { cls: 't-headline', name: 'Headline', sample: 'What usually happens next' },
    { cls: 't-title-large', name: 'Title large', sample: 'Adjustment of status' },
    { cls: 't-title', name: 'Title', sample: 'Deadlines' },
    {
      cls: 't-body',
      name: 'Body',
      sample: 'USCIS accepted the filing and issued a receipt notice.',
    },
    { cls: 't-label', name: 'Label', sample: 'Mark 3 seen' },
    { cls: 't-small', name: 'Small', sample: 'Updated 2 hours ago' },
  ];
  const SHAPES = [
    ['xs', 4],
    ['s', 8],
    ['m', 12],
    ['l', 16],
    ['xl', 28],
    ['2xl', 48],
    ['full', 'full'],
  ] as const;

  // Read resolved role values from the page so the swatches reflect the live theme.
  let roleValues: Record<string, string> = $state({});
  $effect(() => {
    void prefs.seed;
    void prefs.theme;
    void prefs.highContrast;
    requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const role of ROLE_NAMES) next[role] = style.getPropertyValue(`--${role}`).trim();
      roleValues = next;
    });
  });
  const ratio = (a: Role, b: Role) => {
    const x = roleValues[a];
    const y = roleValues[b];
    return x && y && /^#/.test(x) && /^#/.test(y) ? contrast(x, y).toFixed(1) : '';
  };

  let group = $state<'3m' | '6m' | '1y' | 'all'>('6m');
  let chips = $state({ policy: true, data: false, bulletin: false, forms: true });
  let switchOn = $state(true);
  let switchOff = $state(false);
  let checkA = $state(true);
  let checkB = $state(false);
  let receipt = $state('');
  let received = $state('2025-02-14');
  let form = $state<(typeof FORM_TYPES)[number]>('I-485');
  let sheetOpen = $state(false);
  let progress = $state(0.62);
  let motionKey = $state(0);
  let toggled = $state(false);

  const receiptError = $derived(
    receipt && !/^[A-Z]{3}\d{10}$/.test(receipt.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      ? 'Enter 3 letters and 10 digits, for example IOE0123456789.'
      : undefined,
  );

  const demoSeries: ChartSeries[] = [
    {
      id: 'a',
      name: 'Office A',
      points: [
        ['2025-01-01', 10.5],
        ['2025-02-01', 11],
        ['2025-03-01', 11.5],
        ['2025-04-01', 12.2],
        ['2025-05-01', 12],
        ['2025-06-01', 13.1],
        ['2025-07-01', 13.4],
      ].map(([date, value]) => ({ date: date as string, value: value as number })),
    },
    {
      id: 'b',
      name: 'Office B',
      points: [
        ['2025-01-01', 8],
        ['2025-02-01', 8.2],
        ['2025-03-01', 9],
        ['2025-04-01', 9.1],
        ['2025-05-01', 9.8],
        ['2025-06-01', 9.5],
        ['2025-07-01', 10.2],
      ].map(([date, value]) => ({ date: date as string, value: value as number })),
    },
  ];

  const springs = Object.entries(SPRINGS).map(([name, spring]) => ({
    name,
    ...springCurve(spring),
  }));
</script>

<PageHeader title="Design system" back={{ href: '#/settings', label: 'Back to settings' }} />

<p class="intro muted">
  Live reference for Waymark's Material 3 Expressive tokens and components. Colors follow the theme,
  seed, and contrast chosen in Settings.
</p>

<nav class="toc" aria-label="Sections">
  {#each [['color', 'Color'], ['type', 'Type'], ['shape', 'Shape'], ['motion', 'Motion'], ['actions', 'Actions'], ['selection', 'Selection'], ['inputs', 'Inputs'], ['feedback', 'Feedback'], ['data', 'Data display']] as [id, label] (id)}
    <a
      href="#/settings/design"
      onclick={(e) => {
        e.preventDefault();
        document.getElementById(`ds-${id}`)?.scrollIntoView();
      }}>{label}</a
    >
  {/each}
</nav>

<section id="ds-color" aria-labelledby="h-color">
  <h2 id="h-color" class="t-headline">Color roles</h2>
  <p class="muted">
    Tonal palettes are generated in OKLCH from the seed <span class="t-mono">{prefs.seed}</span>.
    Tone equals CIE lightness, so contrast holds across hues. Ratios are WCAG 2 contrast.
  </p>
  <ul class="swatches" role="list">
    {#each PAIRS as [bg, fg] (bg)}
      <li class="swatch" style="background: var(--{bg}); color: var(--{fg})">
        <span class="t-label">{bg}</span>
        <span class="t-small">on: {fg}</span>
        <span class="t-small t-mono">{roleValues[bg] ?? ''} · {ratio(bg, fg)}:1</span>
      </li>
    {/each}
  </ul>
  <ul class="surfaces" role="list">
    {#each SURFACES as bg (bg)}
      <li style="background: var(--{bg})">
        <span class="t-small">{bg}</span>
        <span class="t-small t-mono muted">{ratio(bg, 'on-surface')}:1</span>
      </li>
    {/each}
  </ul>
  <div class="outlines">
    <span style="border-color: var(--outline)" class="t-small"
      >outline {ratio('outline', 'surface')}:1</span
    >
    <span style="border-color: var(--outline-variant)" class="t-small">outline-variant</span>
  </div>
  <h3 class="t-title">Status tones</h3>
  <ul class="tones" role="list">
    {#each TONES as t (t.tone)}
      <li class="tone-{t.tone}">
        <span class="t-label">{t.label}</span>
        <span class="t-small t-mono">{t.role}</span>
      </li>
    {/each}
  </ul>
</section>

<section id="ds-type" aria-labelledby="h-type">
  <h2 id="h-type" class="t-headline">Type</h2>
  <p class="muted">
    Roboto Flex. Width and weight carry emphasis. JetBrains Mono for receipts and codes.
  </p>
  <dl class="type">
    {#each TYPE_SCALE as t (t.cls)}
      <div>
        <dt class="t-small muted">{t.name}</dt>
        <dd class={t.cls}>{t.sample}</dd>
      </div>
    {/each}
    <div>
      <dt class="t-small muted">Mono</dt>
      <dd class="t-mono t-body">IOE0912345678 · IAF · FTA0</dd>
    </div>
  </dl>
</section>

<section id="ds-shape" aria-labelledby="h-shape">
  <h2 id="h-shape" class="t-headline">Shape</h2>
  <ul class="shapes" role="list">
    {#each SHAPES as [name, px] (name)}
      <li>
        <span class="shape" style="border-radius: var(--shape-{name})"></span>
        <span class="t-small">{name} · {px === 'full' ? 'full' : `${px}px`}</span>
      </li>
    {/each}
  </ul>
  <p class="t-small muted">Heroes and case cards use asymmetric corners:</p>
  <div class="hero-sample tone-progress">
    <FormBadge form="I-485" size={56} />
    <div>
      <p class="t-title">Asymmetric container</p>
      <p class="t-small">48 top left and bottom right, 16 elsewhere</p>
    </div>
  </div>
</section>

<section id="ds-motion" aria-labelledby="h-motion">
  <h2 id="h-motion" class="t-headline">Motion</h2>
  <p class="muted">
    Springs drive shape and position through CSS linear() curves, with a cubic-bezier fallback.
    Color and opacity use standard easing. Reduced motion turns movement off.
  </p>
  <div class="row">
    <Button variant="tonal" icon="sync" onclick={() => (motionKey += 1)}>Replay</Button>
  </div>
  <ul class="springs" role="list">
    {#each springs as s (s.name)}
      <li>
        <span class="t-small t-mono">{s.name} · {s.durationMs}ms</span>
        <span class="track">
          {#key motionKey}
            <span
              class="ball"
              style="animation-timing-function: var(--spring-{s.name}); animation-duration: var(--spring-{s.name}-duration)"
            ></span>
          {/key}
        </span>
      </li>
    {/each}
  </ul>
</section>

<section id="ds-actions" aria-labelledby="h-actions">
  <h2 id="h-actions" class="t-headline">Actions</h2>
  <h3 class="t-title">Buttons</h3>
  <p class="t-small muted">Press and hold to see the pill morph to a rounded square.</p>
  <div class="row">
    <Button>Filled</Button>
    <Button variant="tonal">Tonal</Button>
    <Button variant="tertiary">Tertiary</Button>
    <Button variant="outlined">Outlined</Button>
    <Button variant="text">Text</Button>
  </div>
  <div class="row">
    <Button icon="add" size="m">Add case</Button>
    <Button variant="tonal" icon="content_paste" size="m">Paste JSON</Button>
    <Button variant="outlined" icon="download">Export</Button>
    <Button disabled>Disabled</Button>
  </div>
  <h3 class="t-title">Icon buttons</h3>
  <div class="row">
    <IconButton icon="edit" label="Edit" />
    <IconButton icon="content_copy" label="Copy summary" variant="tonal" />
    <IconButton icon="sync" label="Sync" variant="filled" />
    <IconButton icon="delete" label="Delete" variant="outlined" />
    <IconButton
      icon="visibility"
      selectedIcon="visibility_off"
      label="Mask receipt numbers"
      variant="outlined"
      selected={toggled}
      onclick={() => (toggled = !toggled)}
    />
  </div>
  <h3 class="t-title">Connected button group</h3>
  <div class="narrow">
    <ButtonGroup
      label="Range"
      bind:value={group}
      options={[
        { value: '3m', label: '3M' },
        { value: '6m', label: '6M' },
        { value: '1y', label: '1Y' },
        { value: 'all', label: 'All' },
      ]}
    />
  </div>
  <h3 class="t-title">Split button</h3>
  <div class="row">
    <SplitButton
      label="Log a status"
      icon="add"
      menuLabel="Quick statuses"
      onclick={() => showSnackbar('Opened the status log.')}
      items={[
        {
          label: 'Biometrics scheduled',
          icon: 'event',
          onselect: () => showSnackbar('Logged: Biometrics scheduled.'),
        },
        {
          label: 'Interview scheduled',
          icon: 'event',
          onselect: () => showSnackbar('Logged: Interview scheduled.'),
        },
        {
          label: 'Approved',
          icon: 'check_circle',
          onselect: () => showSnackbar('Logged: Approved.'),
        },
      ]}
    />
  </div>
  <h3 class="t-title">FAB menu</h3>
  <div class="fab-frame">
    <FabMenu
      label="Add"
      fixed={false}
      items={[
        { label: 'New case', icon: 'add', onselect: () => showSnackbar('Chose: New case.') },
        {
          label: 'Import JSON',
          icon: 'upload_file',
          onselect: () => showSnackbar('Chose: Import JSON.'),
        },
        {
          label: 'New deadline',
          icon: 'event',
          onselect: () => showSnackbar('Chose: New deadline.'),
        },
      ]}
    />
  </div>
  <h3 class="t-title">Floating toolbar</h3>
  <div class="row">
    <FloatingToolbar
      label="Case actions"
      items={[
        { icon: 'edit', label: 'Edit case', onclick: () => showSnackbar('Chose: Edit case.') },
        {
          icon: 'event',
          label: 'Add deadline',
          onclick: () => showSnackbar('Chose: Add deadline.'),
        },
        {
          icon: 'content_copy',
          label: 'Copy summary',
          onclick: () => showSnackbar('Copied the summary.'),
        },
        {
          icon: 'delete',
          label: 'Delete case',
          onclick: () =>
            showSnackbar('Deleted the case.', {
              label: 'Undo',
              run: () => showSnackbar('Restored the case.'),
            }),
        },
      ]}
    />
    <FloatingToolbar
      label="Vibrant toolbar example"
      vibrant
      items={[
        { icon: 'sync', label: 'Sync', onclick: () => {} },
        { icon: 'content_paste', label: 'Paste JSON', onclick: () => {} },
      ]}
    />
  </div>
</section>

<section id="ds-selection" aria-labelledby="h-selection">
  <h2 id="h-selection" class="t-headline">Selection</h2>
  <h3 class="t-title">Filter chips</h3>
  <div class="row" role="group" aria-label="Source groups">
    <FilterChip label="Policy" bind:selected={chips.policy} />
    <FilterChip label="Data" bind:selected={chips.data} />
    <FilterChip label="Visa Bulletin" bind:selected={chips.bulletin} />
    <FilterChip label="Forms" bind:selected={chips.forms} />
  </div>
  <h3 class="t-title">Switch</h3>
  <div class="narrow">
    <Switch
      label="Mask receipt numbers"
      description="Shows only the last 4 digits."
      bind:checked={switchOn}
    />
    <Switch label="High contrast" bind:checked={switchOff} />
  </div>
  <h3 class="t-title">Checkbox</h3>
  <div class="narrow">
    <Checkbox label="Passport photos" bind:checked={checkA} />
    <Checkbox label="Birth certificate translation" bind:checked={checkB} />
    <Checkbox label="Disabled option" checked={false} disabled />
  </div>
</section>

<section id="ds-inputs" aria-labelledby="h-inputs">
  <h2 id="h-inputs" class="t-headline">Inputs</h2>
  <div class="fields">
    <TextField
      label="Receipt number"
      bind:value={receipt}
      mono
      autocomplete="off"
      spellcheck={false}
      supporting="3 letters and 10 digits"
      error={receiptError}
    />
    <TextField label="Received date" type="date" bind:value={received} />
    <Select
      label="Form"
      bind:value={form}
      options={FORM_TYPES.map((f) => ({ value: f, label: f }))}
    />
  </div>
</section>

<section id="ds-feedback" aria-labelledby="h-feedback">
  <h2 id="h-feedback" class="t-headline">Feedback</h2>
  <div class="row">
    <Button variant="tonal" onclick={() => (sheetOpen = true)}>Open sheet</Button>
    <Button
      variant="outlined"
      onclick={() =>
        showSnackbar('Imported 4 events for IOE0912345678.', {
          label: 'Undo',
          run: () => showSnackbar('Import undone.'),
        })}
    >
      Show snackbar
    </Button>
  </div>
  <h3 class="t-title">Wavy progress</h3>
  <div class="progress-demo">
    <WavyProgress
      value={progress}
      label="Demo progress"
      valueText="{Math.round(progress * 100)} percent"
      animate
    />
    <WavyProgress value={0.25} label="Quarter progress" valueText="25 percent" />
    <WavyProgress value={1.2} label="Over processing time" valueText="120 percent, over time" />
    <input
      type="range"
      min="0"
      max="1.3"
      step="0.01"
      bind:value={progress}
      aria-label="Demo progress value"
    />
  </div>
  <h3 class="t-title">Loading indicator</h3>
  <div class="row">
    <LoadingIndicator label="Loading example" />
    <LoadingIndicator label="Loading example, contained" contained />
  </div>
</section>

<section id="ds-data" aria-labelledby="h-data">
  <h2 id="h-data" class="t-headline">Data display</h2>
  <h3 class="t-title">Form badges</h3>
  <ul class="badges" role="list">
    {#each FORM_TYPES as f (f)}<li><FormBadge form={f} /></li>{/each}
  </ul>
  <h3 class="t-title">Status pills</h3>
  <div class="row">
    {#each STATUS_KEYS as key (key)}<StatusPill status={key} />{/each}
    <Pill label="3 new" tone="new" />
  </div>
  <h3 class="t-title">Line chart</h3>
  <LineChart
    title="Processing time, demo offices"
    series={demoSeries}
    valueLabel="months"
    reference={{ value: 12, label: 'Your case: 12 months' }}
    demo
  />
</section>

<Sheet open={sheetOpen} title="Add case" onclose={() => (sheetOpen = false)}>
  <div class="fields">
    <TextField label="Receipt number" bind:value={receipt} mono error={receiptError} />
    <Select
      label="Form"
      bind:value={form}
      options={FORM_TYPES.map((f) => ({ value: f, label: f }))}
    />
    <TextField label="Received date" type="date" bind:value={received} />
  </div>
  {#snippet actions()}
    <Button variant="text" onclick={() => (sheetOpen = false)}>Cancel</Button>
    <Button
      onclick={() => {
        sheetOpen = false;
        showSnackbar('This sheet is a demo. Nothing was saved.');
      }}>Save case</Button
    >
  {/snippet}
</Sheet>

<style>
  .intro {
    max-width: 60ch;
    margin-bottom: 16px;
  }
  .toc {
    display: flex;
    gap: 4px 16px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .toc a {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    font-size: 0.875rem;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 32px 0;
    border-top: 1px solid var(--outline-variant);
    scroll-margin-top: 16px;
  }
  h3 {
    margin-top: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .narrow {
    max-width: 420px;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .swatch {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 96px;
    padding: 12px;
    border-radius: var(--shape-l);
  }
  .swatch .t-mono {
    margin-top: auto;
  }
  .surfaces {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0;
    margin: 0;
    padding: 0;
    border-radius: var(--shape-l);
    overflow: hidden;
    border: 1px solid var(--outline-variant);
  }
  .surfaces li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    color: var(--on-surface);
  }
  .outlines {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .outlines span {
    padding: 12px 16px;
    border: 2px solid;
    border-radius: var(--shape-m);
  }
  .tones {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .tones li {
    display: flex;
    flex-direction: column;
    padding: 16px;
    border-radius: var(--shape-l);
    background: var(--tone-container);
    color: var(--tone-on-container);
  }
  .type {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
  }
  .type dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .shapes {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 0;
    padding: 0;
  }
  .shapes li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .shape {
    width: 72px;
    height: 72px;
    background: var(--primary-container);
  }
  .hero-sample {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px;
    border-radius: var(--shape-2xl) var(--shape-l) var(--shape-2xl) var(--shape-l);
    background: var(--tone-container);
    color: var(--tone-on-container);
  }
  .springs {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
  }
  .springs li {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .track {
    position: relative;
    height: 24px;
    border-radius: 12px;
    background: var(--surface-container-high);
  }
  .ball {
    position: absolute;
    top: 0;
    left: 0;
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: var(--primary);
    animation-name: slide;
    animation-fill-mode: both;
  }
  @keyframes slide {
    from {
      left: 0;
    }
    to {
      left: calc(100% - 24px);
    }
  }
  .fab-frame {
    position: relative;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    min-height: 280px;
    padding: 16px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
    overflow: hidden;
  }
  .fields {
    display: grid;
    gap: 16px;
    max-width: 420px;
  }
  .progress-demo {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 480px;
  }
  .progress-demo input {
    accent-color: var(--primary);
    min-height: 32px;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
  }
</style>
