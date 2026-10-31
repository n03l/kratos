import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';

// Another site could show Kratos in a frame and trick taps on it (Erase all data, Connect Google Drive).
// Hosts that can send headers forbid framing (vercel.json); GitHub Pages can't, so the app refuses here too.
if (window.top !== window.self) {
  const p = document.createElement('p');
  const link = document.createElement('a');
  link.href = location.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open Kratos';
  p.append('Kratos can’t run inside another page. ', link);
  document.getElementById('app')!.replaceChildren(p);
} else {
  registerSW({ immediate: true });
  mount(App, { target: document.getElementById('app')! });
}
