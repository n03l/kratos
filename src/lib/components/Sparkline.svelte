<script lang="ts">
  // A trend at a glance, no axes: the full chart (with hover and a table) is one tap away.
  let { points, height = 36 }: { points: { x: number; y: number }[]; height?: number } = $props();

  let width = $state(120);
  const pad = 4;

  const coords = $derived.by(() => {
    if (points.length < 2) return [];
    // Loops, not Math.min(...xs): spreading a long history overflows the stack.
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of points) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    return points.map((p) => [
      pad + ((p.x - x0) / (x1 - x0 || 1)) * (width - 2 * pad),
      pad + (1 - (p.y - y0) / (y1 - y0)) * (height - 2 * pad),
    ]);
  });
  const path = $derived(coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''));
  const end = $derived(coords.at(-1));
</script>

<div class="spark" bind:clientWidth={width} aria-hidden="true">
  <svg {width} {height}>
    <path d={path} />
    {#if end}<circle cx={end[0]} cy={end[1]} r="4" />{/if}
  </svg>
</div>

<style>
  .spark { width: 100%; min-width: 0; }
  svg { display: block; overflow: visible; }
  path { fill: none; stroke: var(--chalk-dim); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  circle { fill: var(--chalk); stroke: var(--iron-0); stroke-width: 2; }
</style>
