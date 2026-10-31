// Hash routing: works on GitHub Pages and Vercel without server rewrites.

const read = () => decodeURIComponent(location.hash.replace(/^#/, '')) || '/';

export const route = $state({ path: read() });

window.addEventListener('hashchange', () => {
  route.path = read();
  window.scrollTo(0, 0);
});

export function navigate(path: string) {
  location.hash = path;
}

/** Match `/a/:id` style patterns; returns params or null. */
export function match(pattern: string, path = route.path): Record<string, string> | null {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = a[i];
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
