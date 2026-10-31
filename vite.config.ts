import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// BASE_PATH lets the same build serve from a GitHub Pages subpath (e.g. /kratos/) or the root on Vercel.
const base = process.env.BASE_PATH ?? '/';

// The dev server has no login. It binds to loopback unless DEV_HOST names another address (e.g. a LAN IP to
// test on a phone). Vite's allowedHosts default still rejects other Host headers, which blocks DNS rebinding.
const host = process.env.DEV_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.warn(`\n  WARNING: dev server reachable at ${host}. Anyone on that network can open it and read the source.\n`);
}

// Commit shown on the More screen: the one Vercel or GitHub Actions is building, else the checkout's HEAD.
function buildCommit(): string {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      sha = '';
    }
  }
  return /^[0-9a-f]{40}$/.test(sha) ? sha : '';
}

// Content Security Policy for the built app: only its own files, plus Google sign-in and the Drive API for
// sync. Not in dev, where Vite injects inline styles.
const csp = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "img-src 'self' data:",
  // The countdown clip is generated in the page (see sound.ts).
  'media-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base,
  // Variables the app can read: VITE_* and the (public) Google OAuth client id. Never widen this to a
  // prefix that could match secrets.
  envPrefix: ['VITE_', 'GOOGLE_CLIENT_ID'],
  define: { __COMMIT__: JSON.stringify(buildCommit()) },
  server: { host, port: 5173, strictPort: true },
  // Same anti-framing headers as vercel.json, so the preview behaves like production.
  preview: { host, port: 4173, strictPort: true, headers: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } },
  plugins: [
    svelte(),
    {
      name: 'kratos-csp',
      apply: 'build',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Kratos',
        short_name: 'Kratos',
        description: 'Log lifts, warmups, myo-reps and supersets across every gym you train at.',
        theme_color: '#0b0c0f',
        background_color: '#0b0c0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          // PNGs for places that can't draw SVG, such as Android notifications (see media.ts).
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
