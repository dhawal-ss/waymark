<script lang="ts">
  import type { RouteName } from '../stores/router.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface NavItem {
    route: RouteName;
    path: string;
    label: string;
    icon: IconName;
    activeIcon: IconName;
  }

  let { current }: { current: RouteName } = $props();

  const ITEMS: NavItem[] = [
    { route: 'cases', path: '/cases', label: 'Cases', icon: 'folder', activeIcon: 'folder_fill' },
    {
      route: 'insights',
      path: '/insights',
      label: 'Insights',
      icon: 'monitoring',
      activeIcon: 'monitoring_fill',
    },
    {
      route: 'updates',
      path: '/updates',
      label: 'Updates',
      icon: 'newspaper',
      activeIcon: 'newspaper_fill',
    },
    {
      route: 'tools',
      path: '/tools',
      label: 'Tools',
      icon: 'handyman',
      activeIcon: 'handyman_fill',
    },
    {
      route: 'settings',
      path: '/settings',
      label: 'Settings',
      icon: 'settings',
      activeIcon: 'settings_fill',
    },
  ];

  const activeRoute = $derived(
    current === 'design' ? 'settings' : current === 'case' ? 'cases' : current,
  );
</script>

<nav class="nav" aria-label="Main">
  <ul role="list">
    {#each ITEMS as item (item.route)}
      {@const active = item.route === activeRoute}
      <li>
        <a href="#{item.path}" class:active aria-current={active ? 'page' : undefined}>
          <span class="indicator">
            <Icon name={active ? item.activeIcon : item.icon} size={24} />
          </span>
          <span class="label">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    height: calc(var(--nav-bar-height) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface-container);
  }
  ul {
    display: flex;
    height: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    flex: 1;
    min-width: 0;
  }
  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 100%;
    color: var(--on-surface-variant);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }
  a:focus-visible {
    outline: none;
  }
  a:focus-visible .indicator {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
  }
  .indicator {
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 32px;
    border-radius: 16px;
    transition:
      background-color var(--duration-short) var(--ease-standard),
      width var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  @media (hover: hover) {
    a:hover .indicator {
      background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent);
    }
  }
  a.active .indicator {
    width: 64px;
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .label {
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 540;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.active {
    color: var(--on-surface);
  }
  a.active .label {
    font-weight: 700;
  }

  @media (min-width: 840px) {
    .nav {
      top: 0;
      right: auto;
      width: var(--nav-rail-width);
      height: 100dvh;
      padding: 44px 0 0;
      background: var(--surface);
    }
    ul {
      flex-direction: column;
      gap: 12px;
      height: auto;
    }
    li {
      flex: none;
    }
    a {
      height: 64px;
    }
  }
  @media (forced-colors: active) {
    a.active .indicator {
      border: 2px solid Highlight;
    }
  }
</style>
