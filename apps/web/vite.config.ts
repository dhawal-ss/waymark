import { createHash } from 'node:crypto';
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

/**
 * Content Security Policy for production builds, with hashes for the inline scripts. Styles allow
 * 'unsafe-inline' because the theme is applied as a generated style element. connect-src allows
 * any https origin because the user chooses the sync server at run time.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'waymark-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          ([, body]) =>
            `'sha256-${createHash('sha256')
              .update(body ?? '')
              .digest('base64')}'`,
        );
        const policy = [
          "default-src 'none'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data:",
          "manifest-src 'self'",
          "worker-src 'self'",
          "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
          "base-uri 'none'",
          "form-action 'none'",
          "object-src 'none'",
          "frame-src 'none'",
        ].join('; ');
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="no-referrer" />`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [
    themeTokens(),
    contentSecurityPolicy(),
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
        // Share the copied USCIS JSON, or a saved JSON file, into Waymark (Android, installed
        // app). POST keeps the case data out of URLs; public/share-target.js handles it.
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'shared_title',
            text: 'shared_text',
            url: 'shared_url',
            files: [
              {
                name: 'shared_file',
                accept: ['application/json', 'text/plain', '.json', '.txt'],
              },
            ],
          },
        },
        shortcuts: [
          { name: 'New case', short_name: 'New case', url: './?action=new-case' },
          { name: 'Import USCIS JSON', short_name: 'Import JSON', url: './?action=import' },
        ],
        categories: ['productivity', 'utilities'],
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
        globIgnores: ['share-target.js'],
        importScripts: ['share-target.js'],
        // Control the page on the first visit, so offline use and sharing work right away.
        clientsClaim: true,
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
