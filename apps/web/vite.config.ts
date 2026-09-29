import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DEFAULT_SEED, motionCss, themeCss } from '@waymark/theme';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME_ID = 'virtual:waymark-theme.css';

/** Default theme roles and spring tokens, computed at build time so first paint is styled. */
function themeTokens(): Plugin {
  return {
    name: 'waymark-theme-tokens',
    resolveId(id) {
      return id === THEME_ID ? THEME_ID : undefined;
    },
    load(id) {
      if (id !== THEME_ID) return undefined;
      return themeCss({ seed: DEFAULT_SEED, mode: 'system', highContrast: false }) + motionCss();
    },
  };
}

export default defineConfig({
  plugins: [
    themeTokens(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Waymark',
        short_name: 'Waymark',
        description: 'Private USCIS case tracker. Data stays on this device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f2fbf9',
        theme_color: '#f2fbf9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: true,
  },
});
