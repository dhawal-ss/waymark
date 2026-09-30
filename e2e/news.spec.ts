import { expect, test, type Page } from '@playwright/test';
import {
  fakeSyncServer,
  newsFixture,
  olderNews,
  SYNC_URL,
  type NewsFixtureItem,
} from './fake-sync-server';
import { expectNoAxeViolations, loadExample, setPrefs, snackbar } from './helpers';

/** Items the fixture serves that the app shows (one has a link that is not official). */
const SHOWN = newsFixture().length - 1;
const FIRST_TITLE = 'Employment Authorization for Certain Renewal Applicants Filing Form I-765';

async function turnOnPublicData(page: Page) {
  await page.goto('./#/settings');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Public data' }),
  });
  await page.getByLabel('Server address').fill(SYNC_URL);
  await section.getByRole('switch', { name: 'Load public data from the sync server' }).check();
  await expect(section.getByText(/Processing times:\s*updated just now/)).toBeVisible();
}

/** Fake server, public data on, and optionally the example cases (forms I-485, I-765, I-130). */
async function start(page: Page, options: { news?: NewsFixtureItem[]; cases?: boolean } = {}) {
  const server = await fakeSyncServer(page, options.news ? { news: options.news } : {});
  if (options.cases !== false) await loadExample(page);
  await turnOnPublicData(page);
  return server;
}

/** Press ArrowDown until card number `n` has focus. A card taller than the feed scrolls first. */
async function focusCard(page: Page, n: number) {
  const position = () =>
    page.evaluate(() => document.activeElement?.closest('article')?.getAttribute('aria-posinset'));
  for (let i = 0; i < 12 && (await position()) !== String(n); i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(30);
  }
  expect(await position()).toBe(String(n));
}

const feedOf = (page: Page) => page.getByRole('feed', { name: 'Official updates' });

async function openFeed(page: Page) {
  await page.goto('./#/updates');
  await expect(feedOf(page)).toBeVisible();
  return feedOf(page);
}

test('public data off: sources with an offer, and an empty state on the feed tab', async ({
  page,
}) => {
  const server = await fakeSyncServer(page);
  await page.goto('./#/updates');
  await expect(page.locator('main h1')).toHaveText('Updates');
  await expect(page.getByRole('radio', { name: 'Sources' })).toBeChecked();
  const offer = page.getByRole('region', { name: 'Live feed of official updates' });
  await expect(offer).toContainText('Enter its address in Settings under Automatic checks');
  await expect(offer.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
    'href',
    '#/settings',
  );
  await expect(page.getByRole('heading', { name: 'Relevant to your forms' })).toBeHidden();

  await page.getByRole('radio', { name: 'Feed' }).click();
  await expect(page.getByRole('heading', { name: 'Public data is off' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show official sources' }).click();
  await expect(page.getByRole('radio', { name: 'Sources' })).toBeChecked();
  await expect(page.getByRole('link', { name: /USCIS newsroom/ })).toBeVisible();
  expect(server.state.requests).toEqual([]);
});

test('turns on public data from Updates when a server address is saved', async ({ page }) => {
  const server = await start(page);
  await page.goto('./#/settings');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Public data' }),
  });
  await section.getByRole('switch', { name: 'Load public data from the sync server' }).uncheck();
  await page.goto('./#/updates');
  await expect(page.getByRole('radio', { name: 'Sources' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Turn on public data' })).toBeVisible();
  expect(server.state.newsRequests).toEqual([]);
  await page.getByRole('button', { name: 'Turn on public data' }).click();
  await expect(page.getByRole('radio', { name: 'Feed' })).toBeChecked();
  await expect(feedOf(page)).toBeVisible();
  expect(server.state.newsRequests).toEqual(['limit=40']);
});

test('feed is the default with public data on and shows official updates as cards', async ({
  page,
}) => {
  const server = await start(page);
  await page.goto('./#/updates');
  await expect(page.getByRole('radio', { name: 'Feed' })).toBeChecked();
  const feed = feedOf(page);
  await expect(feed).toBeVisible();
  const cards = feed.getByRole('article');
  await expect(cards).toHaveCount(SHOWN);
  await expect(cards.first().getByRole('heading', { level: 2 })).toHaveText(FIRST_TITLE);
  await expect(cards.first()).toHaveAttribute('aria-posinset', '1');
  await expect(cards.first()).toHaveAttribute('aria-setsize', String(SHOWN));
  await expect(cards.first()).toContainText('Rule');
  await expect(cards.first().getByText('Work and study')).toBeVisible();
  await expect(cards.first().locator('time')).toHaveAttribute('datetime', '2026-09-28');
  await expect(cards.first().locator('time')).toHaveText('Sep 28, 2026');
  await expect(cards.first()).toContainText('The Department of Homeland Security is amending');
  await expect(cards.first()).toContainText('1 of 10');
  // An item whose link is not on an official domain is dropped.
  await expect(page.getByText('Item with a link that is not on an official domain')).toHaveCount(0);
  // An empty summary shows nothing.
  const scam = cards.filter({ hasText: 'scam callers' });
  await expect(scam.locator('.summary')).toHaveCount(0);
  await expect(scam.getByRole('heading', { level: 2 })).toBeVisible();
  // Requests carry paging values only.
  expect(server.state.newsRequests).toEqual(['limit=40']);
});

test('cards fill the space between the header and the bottom navigation', async ({
  page,
}, info) => {
  await start(page);
  const feed = await openFeed(page);
  const dims = await feed.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const card = el.querySelector('article')!.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: el.clientHeight,
      card: card.height,
      snap: getComputedStyle(el).scrollSnapType,
      stop: getComputedStyle(el.querySelector('article')!).scrollSnapStop,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(dims.snap).toBe('y mandatory');
  expect(dims.stop).toBe('always');
  expect(dims.card).toBeCloseTo(dims.height, 0);
  expect(dims.overflowX).toBeLessThanOrEqual(0);
  expect(dims.height).toBeGreaterThan(400);
  if (info.project.name === 'mobile-360') {
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    expect(dims.bottom).toBeLessThanOrEqual(nav!.y);
    expect(nav!.y - dims.bottom).toBeLessThan(24);
  } else {
    expect(dims.bottom).toBeLessThanOrEqual(800);
  }
});

test('arrow keys, page keys, Home, End, j and k move card by card and focus the card', async ({
  page,
}) => {
  await start(page);
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  const focused = page.locator('article:focus');
  await cards.first().focus();
  await expect(cards.first()).toHaveAttribute('tabindex', '0');

  await page.keyboard.press('ArrowDown');
  await expect(focused).toHaveAttribute('aria-posinset', '2');
  await expect(cards.nth(1)).toBeInViewport({ ratio: 0.9 });
  await expect(cards.first()).toHaveAttribute('tabindex', '-1');
  await expect(cards.nth(1)).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('j');
  await expect(focused).toHaveAttribute('aria-posinset', '3');
  await page.keyboard.press('PageDown');
  await expect(focused).toHaveAttribute('aria-posinset', '4');
  await page.keyboard.press('ArrowUp');
  await expect(focused).toHaveAttribute('aria-posinset', '3');
  await page.keyboard.press('k');
  await expect(focused).toHaveAttribute('aria-posinset', '2');
  await page.keyboard.press('PageUp');
  await expect(focused).toHaveAttribute('aria-posinset', '1');
  await page.keyboard.press('ArrowUp');
  await expect(focused).toHaveAttribute('aria-posinset', '1');

  await page.keyboard.press('End');
  await expect(focused).toHaveAttribute('aria-posinset', String(SHOWN));
  await expect(cards.last()).toBeInViewport({ ratio: 0.9 });
  await expect(cards.last()).toContainText(`${SHOWN} of ${SHOWN}`);
  await page.keyboard.press('ArrowDown');
  await expect(focused).toHaveAttribute('aria-posinset', String(SHOWN));
  await page.keyboard.press('Home');
  await expect(focused).toHaveAttribute('aria-posinset', '1');
  await expect(cards.first()).toBeInViewport({ ratio: 0.9 });
});

test('Tab is not trapped: only the card in view has controls in the tab order', async ({
  page,
}) => {
  await start(page);
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  await cards.first().focus();
  await page.keyboard.press('Tab');
  await expect(cards.first().getByRole('link', { name: /^Open on/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cards.first().getByRole('button', { name: /^(Share|Copy link)/ })).toBeFocused();
  await page.keyboard.press('Tab');
  const insideFeed = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('[role="feed"]')),
  );
  expect(insideFeed).toBe(false);
  await expect(cards.nth(1).getByRole('link', { name: /^Open on/ })).toHaveAttribute(
    'tabindex',
    '-1',
  );
});

test('shows the position and a progress rail that follow the card in view', async ({ page }) => {
  await start(page);
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  await expect(cards.first()).toContainText('1 of 10');
  const thumb = page.locator('.rail .thumb');
  const top = () => thumb.evaluate((el) => el.getBoundingClientRect().top);
  const start0 = await top();
  await cards.first().focus();
  await page.keyboard.press('End');
  await expect(cards.last()).toContainText('10 of 10');
  await expect.poll(top).toBeGreaterThan(start0 + 50);
  await expect(page.locator('.rail')).toHaveAttribute('aria-hidden', 'true');
});

test('filters show the categories present and reset to the first card', async ({ page }) => {
  await start(page);
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  const filters = page.getByRole('group', { name: 'Filter updates' });
  for (const name of ['For your cases', 'All', 'Fees', 'Forms', 'Policy', 'Visa Bulletin'])
    await expect(filters.getByRole('button', { name, exact: true })).toBeVisible();
  // "Other" has no shown item: the one item in it is dropped for its link.
  await expect(filters.getByRole('button', { name: 'Other', exact: true })).toHaveCount(0);
  await expect(filters.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await cards.first().focus();
  await page.keyboard.press('End');
  await expect(cards.last()).toBeInViewport({ ratio: 0.9 });

  await filters.getByRole('button', { name: 'Forms', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: '2 updates shown' })).toHaveCount(1);
  await expect(cards.first()).toContainText('1 of 2');
  await expect(cards.first()).toBeInViewport({ ratio: 0.9 });
  expect(await feed.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(filters.getByRole('button', { name: 'Forms', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(filters.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await filters.getByRole('button', { name: 'Fees', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('heading', { level: 2 })).toHaveText(
    'Adjustment of the fee schedule for immigration benefit requests',
  );
  // Pressing the selected chip again returns to all.
  await filters.getByRole('button', { name: 'Fees', exact: true }).click();
  await expect(cards).toHaveCount(SHOWN);
});

test('For your cases uses the forms of your cases and never sends them to the server', async ({
  page,
}) => {
  const server = await start(page);
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  // Without a filter, only items that mention a form of a case carry the badge.
  const visa = cards.filter({ hasText: 'USCIS announces which chart applies' });
  await expect(visa.getByText('For your cases')).toBeVisible();
  await expect(visa.getByRole('list', { name: 'Forms and relevance' })).toContainText('I-485');
  await expect(
    cards.filter({ hasText: 'USCIS welcomes new citizens' }).getByText('For your cases'),
  ).toHaveCount(0);
  await expect(
    cards.filter({ hasText: 'Adjustment of the fee schedule' }).getByText('For your cases'),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'For your cases', exact: true }).click();
  // Items for I-765, I-485, or I-130: the work rule, the chart notice, the collection notice,
  // the public charge rule, temporary protected status, and processing times.
  await expect(cards).toHaveCount(6);
  for (const card of await cards.all())
    await expect(card.getByText('For your cases')).toBeVisible();
  await expect(cards.filter({ hasText: 'USCIS welcomes new citizens' })).toHaveCount(0);

  // The server saw paging values only.
  expect(
    server.state.newsRequests.every((r) => /^limit=\d+(&before=[\d-]+&beforeId=[^&]+)?$/.test(r)),
  ).toBe(true);
});

test('For your cases explains what is missing when there are no cases', async ({ page }) => {
  await start(page, { cases: false });
  await openFeed(page);
  await page.getByRole('button', { name: 'For your cases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No cases to match' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to cases' })).toHaveAttribute('href', '#/cases');
  await page.getByRole('button', { name: 'Show all updates' }).click();
  await expect(feedOf(page).getByRole('article')).toHaveCount(SHOWN);
});

test('list view shows the same items compactly and is remembered', async ({ page }) => {
  await start(page);
  await openFeed(page);
  const toggle = page.getByRole('button', { name: 'List view' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('feed')).toHaveCount(0);
  const list = page.getByRole('list', { name: 'Official updates' });
  await expect(list.locator(':scope > li')).toHaveCount(SHOWN);
  await expect(list.getByRole('heading', { level: 2 }).first()).toHaveText(FIRST_TITLE);
  // Filters still apply.
  await page.getByRole('button', { name: 'Fees', exact: true }).click();
  await expect(list.locator(':scope > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.reload();
  await expect(page.getByRole('list', { name: 'Official updates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(feedOf(page)).toBeVisible();
});

test('a failed load says what went wrong and Retry loads the feed', async ({ page }) => {
  const server = await start(page);
  server.state.newsFailures = 1;
  await page.goto('./#/updates');
  const alert = page.getByRole('alert').filter({ hasText: 'Updates could not be loaded' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('The news source is unavailable. Try again in a few minutes.');
  await expect(feedOf(page)).toHaveCount(0);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(feedOf(page).getByRole('article')).toHaveCount(SHOWN);
  await expect(alert).toBeHidden();
});

test('an unreachable server gives a plain message with a way out', async ({ page }) => {
  await start(page);
  await page.route(`${SYNC_URL}/v1/public/news*`, (route) => route.abort());
  await page.goto('./#/updates');
  const alert = page.getByRole('alert').filter({ hasText: 'Updates could not be loaded' });
  await expect(alert).toContainText('The sync server did not respond. Check your connection');
  await alert.getByRole('button', { name: 'Show official sources' }).click();
  await expect(page.getByRole('radio', { name: 'Sources' })).toBeChecked();
});

test('an empty feed offers to check again', async ({ page }) => {
  const server = await start(page, { news: [] });
  await page.goto('./#/updates');
  await expect(page.getByRole('heading', { name: 'No updates yet' })).toBeVisible();
  server.state.news = newsFixture();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(feedOf(page).getByRole('article')).toHaveCount(SHOWN);
});

test('loads older updates on reaching the last card, and reports a failure with Retry', async ({
  page,
}) => {
  const server = await start(page, { news: [...newsFixture(), ...olderNews(60)] });
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  await expect(cards).toHaveCount(39);
  await cards.first().focus();

  server.state.newsFailures = 1;
  await page.keyboard.press('End');
  const failed = cards.last().getByRole('alert');
  await expect(failed).toContainText('Older updates could not be loaded');
  expect(server.state.newsRequests).toHaveLength(2);
  expect(server.state.newsRequests[1]).toMatch(
    /^limit=40&before=\d{4}-\d{2}-\d{2}&beforeId=federal-register%3A[\w-]+$/,
  );
  await expect(cards).toHaveCount(39);

  await cards.last().getByRole('button', { name: 'Retry' }).click();
  await expect(cards).toHaveCount(70);
  await expect(feed).toHaveAttribute('aria-busy', 'false');
  await expect(cards.first()).toHaveAttribute('aria-setsize', '70');
  await expect(cards.first()).toContainText('1 of 70');
  // No repeats, and the newest items stay first.
  const titles = await cards.getByRole('heading', { level: 2 }).allTextContents();
  expect(new Set(titles).size).toBe(titles.length);
  expect(titles[0]).toBe(FIRST_TITLE);

  // Less than a full page came back: this is the end of the list.
  await cards.first().focus();
  await page.keyboard.press('End');
  await expect(cards.last()).toContainText('End of the list');
  await expect(cards.last().getByRole('button', { name: 'official sources' })).toBeVisible();
  expect(server.state.newsRequests).toHaveLength(3);
});

test('a button on the last card loads older updates, and stays out of the way after', async ({
  page,
}) => {
  const server = await start(page, { news: [...newsFixture(), ...olderNews(60)] });
  const feed = await openFeed(page);
  const cards = feed.getByRole('article');
  await page.getByRole('button', { name: 'Fees', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('button', { name: 'Load older updates' })).toBeVisible();
  await cards.first().getByRole('button', { name: 'Load older updates' }).click();
  await expect.poll(() => server.state.newsRequests.length).toBe(2);
});

test('the link opens the official page in a new tab, and Copy link uses the snackbar', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  await start(page);
  const feed = await openFeed(page);
  const card = feed.getByRole('article').first();
  const link = card.getByRole('link', { name: /^Open on federalregister\.gov/ });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute(
    'href',
    /^https:\/\/www\.federalregister\.gov\/documents\/2026\/09\/28\//,
  );
  await expect(link).toHaveAccessibleName('Open on federalregister.gov (opens in a new tab)');
  await expect(link.locator('.visually-hidden')).toHaveText('(opens in a new tab)');
  // Every external link in the feed points to an official domain.
  const hosts = await feed
    .locator('a[target="_blank"]')
    .evaluateAll((els) => els.map((a) => new URL((a as HTMLAnchorElement).href).hostname));
  expect(hosts.length).toBeGreaterThan(5);
  for (const host of hosts) expect(host).toMatch(/(^|\.)(uscis|federalregister)\.gov$/);

  const copy = card.getByRole('button', { name: `Copy link: ${FIRST_TITLE}` });
  await copy.click();
  await expect(snackbar(page, 'Copied the link.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^https:\/\/www\.federalregister\.gov\/documents\/2026\/09\/28\//,
  );
});

test('Share uses the share sheet when the browser has one', async ({ page }) => {
  await page.addInitScript(() => {
    (navigator as unknown as { share: (d: unknown) => Promise<void> }).share = async (d) => {
      (window as unknown as { shared: unknown }).shared = d;
    };
  });
  await start(page);
  const feed = await openFeed(page);
  await feed
    .getByRole('article')
    .first()
    .getByRole('button', { name: /^Share:/ })
    .click();
  const shared = await page.evaluate(
    () => (window as unknown as { shared: { title: string; url: string } }).shared,
  );
  expect(shared.title).toBe(FIRST_TITLE);
  expect(shared.url).toMatch(/^https:\/\/www\.federalregister\.gov\//);
});

test('a long title fits its card without sideways scrolling', async ({ page }) => {
  await start(page);
  const feed = await openFeed(page);
  const card = feed.getByRole('article').filter({ hasText: 'Inadmissibility on Public Charge' });
  await card.focus();
  await expect(card).toBeInViewport({ ratio: 0.9 });
  const overflow = await card.evaluate((el) => {
    const body = el.querySelector('[data-card-body]')!;
    return {
      x: body.scrollWidth - body.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.page).toBeLessThanOrEqual(0);
  // The actions stay in view even when the text is taller than the card.
  await expect(card.getByRole('link', { name: /^Open on/ })).toBeInViewport();
});

test('reduced motion: no smooth scrolling and no entrance animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const w = window as unknown as { scrolls: string[] };
    w.scrolls = [];
    const original = Element.prototype.scrollTo as (...a: unknown[]) => void;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      w.scrolls.push(String((args[0] as ScrollToOptions | undefined)?.behavior));
      return original.apply(this, args);
    } as typeof Element.prototype.scrollTo;
  });
  await start(page);
  const feed = await openFeed(page);
  await feed.getByRole('article').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('article:focus')).toHaveAttribute('aria-posinset', '2');
  const state = await page.evaluate(() => {
    const scrolls = (window as unknown as { scrolls: string[] }).scrolls;
    const mark = document.querySelector('.mark')!;
    return {
      last: scrolls.at(-1),
      behavior: getComputedStyle(document.querySelector('[role="feed"]')!).scrollBehavior,
      rotate: getComputedStyle(mark).rotate,
      duration: parseFloat(getComputedStyle(document.querySelector('article')!).transitionDuration),
    };
  });
  expect(state.last).toBe('auto');
  expect(state.behavior).not.toBe('smooth');
  expect(state.rotate).toBe('none');
  expect(state.duration).toBeLessThan(0.01);
});

test('motion allowed: keyboard moves scroll smoothly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const w = window as unknown as { scrolls: string[] };
    w.scrolls = [];
    const original = Element.prototype.scrollTo as (...a: unknown[]) => void;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      w.scrolls.push(String((args[0] as ScrollToOptions | undefined)?.behavior));
      return original.apply(this, args);
    } as typeof Element.prototype.scrollTo;
  });
  await start(page);
  const feed = await openFeed(page);
  await feed.getByRole('article').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('article:focus')).toHaveAttribute('aria-posinset', '2');
  expect(
    await page.evaluate(() => (window as unknown as { scrolls: string[] }).scrolls.at(-1)),
  ).toBe('smooth');
});

test('the feed runs under the content security policy without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await start(page);
  const feed = await openFeed(page);
  await feed.getByRole('article').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('list', { name: 'Official updates' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('the previous and next buttons show on wide screens and move one card', async ({
  page,
}, info) => {
  await start(page);
  const feed = await openFeed(page);
  const next = page.getByRole('button', { name: 'Next update' });
  const previous = page.getByRole('button', { name: 'Previous update' });
  if (info.project.name === 'mobile-360') {
    await expect(next).toBeHidden();
    return;
  }
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(feed.getByRole('article').nth(1)).toBeInViewport({ ratio: 0.9 });
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(feed.getByRole('article').first()).toBeInViewport({ ratio: 0.9 });
});

const VARIANTS = [
  { name: 'light', prefs: { theme: 'light' } },
  { name: 'dark', prefs: { theme: 'dark' } },
  { name: 'light high contrast', prefs: { theme: 'light', highContrast: true } },
  { name: 'dark high contrast', prefs: { theme: 'dark', highContrast: true } },
  { name: 'marigold light', prefs: { theme: 'light', seed: '#eaa221' } },
];

for (const variant of VARIANTS) {
  test(`axe: feed cards, list view, and states in ${variant.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await setPrefs(page, variant.prefs);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    const feed = await openFeed(page);
    const cards = feed.getByRole('article');
    await expectNoAxeViolations(page);
    // Every card, so each category tone is checked.
    await cards.first().focus();
    for (let n = 2; n <= SHOWN; n++) {
      await focusCard(page, n);
      await expect(cards.nth(n - 1)).toBeInViewport({ ratio: 0.9 });
      await expectNoAxeViolations(page);
    }
    await page.getByRole('button', { name: 'For your cases', exact: true }).click();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.getByRole('list', { name: 'Official updates' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test('axe: empty, error, and off states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/updates');
  await expectNoAxeViolations(page);
  await page.getByRole('radio', { name: 'Feed' }).click();
  await expect(page.getByRole('heading', { name: 'Public data is off' })).toBeVisible();
  await expectNoAxeViolations(page);
  const server = await start(page, { news: [] });
  await page.goto('./#/updates');
  await expect(page.getByRole('heading', { name: 'No updates yet' })).toBeVisible();
  await expectNoAxeViolations(page);
  server.state.newsFailures = 1;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'Updates could not be loaded' })).toBeVisible();
  await expectNoAxeViolations(page);
});
