import 'virtual:waymark-theme.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');
mount(App, { target });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  });
}
