<script lang="ts" module>
  export interface Point {
    x: number; // epoch ms
    y: number;
    /** Series colour for this mark (e.g. its gym); defaults to chalk. */
    color?: string;
    note?: string;
  }
  export interface LegendItem { label: string; color: string }
</script>

<script lang="ts">
  let {
    points, kind = 'line', unit = 'kg', title, showTitle = true, legend = [], height = 180, digits = 1,
  }: {
    points: Point[]; kind?: 'line' | 'bars'; unit?: string; title: string;
    /** False when the surrounding panel already shows the title. */
    showTitle?: boolean;
    legend?: LegendItem[]; height?: number; digits?: number;
  } = $props();

  let width = $state(320);
  let hover = $state<number | null>(null);

  const pad = { t: 14, r: 44, b: 22, l: 36 };
  const sorted = $derived([...points].sort((a, b) => a.x - b.x));

  function niceStep(span: number, count: number) {
    const raw = span / Math.max(1, count);
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  }

  const scale = $derived.by(() => {
    // Loops, not Math.min(...ys): spreading a long history overflows the stack.
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of sorted) {
      lo = Math.min(lo, p.y);
      hi = Math.max(hi, p.y);
    }
    if (kind === 'bars') lo = 0;
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep(hi - lo, 3);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    const x0 = sorted[0]?.x ?? 0;
    const x1 = sorted.at(-1)?.x ?? 1;
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const band = w / Math.max(1, sorted.length);
    return {
      ticks,
      x: (v: number, i: number) =>
        kind === 'bars' ? pad.l + band * i + band / 2 : pad.l + (x1 === x0 ? w / 2 : ((v - x0) / (x1 - x0)) * w),
      y: (v: number) => pad.t + h - ((v - lo) / (hi - lo)) * h,
      band,
    };
  });

  const path = $derived(sorted.map((p, i) => `${i ? 'L' : 'M'}${scale.x(p.x, i).toFixed(1)},${scale.y(p.y).toFixed(1)}`).join(''));
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(digits));

  function onmove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    sorted.forEach((p, i) => {
      if (Math.abs(scale.x(p.x, i) - px) < Math.abs(scale.x(sorted[best].x, best) - px)) best = i;
    });
    hover = sorted.length ? best : null;
  }

  /** Column with a 4px rounded data end and a square base. */
  function barPath(cx: number, top: number, base: number, w: number) {
    const r = Math.min(4, w / 2, (base - top) / 2);
    const l = cx - w / 2;
    return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${l + w - r}Q${l + w},${top} ${l + w},${top + r}V${base}Z`;
  }

  const hp = $derived(hover !== null ? sorted[hover] : null);
  const last = $derived(sorted.at(-1));
</script>

<figure class="chart">
  <figcaption class="spread">
    <span class={showTitle ? 'h3' : 'sr-only'}>{title}</span>
    {#if legend.length > 1}
      <span class="legend small">
        {#each legend as l, i (i)}<span class="key"><i style:background={l.color}></i>{l.label}</span>{/each}
      </span>
    {/if}
  </figcaption>

  {#if sorted.length === 0}
    <p class="muted small empty">Nothing logged yet. Finish a workout with this exercise to see it here.</p>
  {:else}
    <div class="plot" bind:clientWidth={width}>
      <svg {width} {height} role="img" aria-label="{title}: {sorted.length} points, latest {fmt(last!.y)} {unit}"
        onpointermove={onmove} onpointerdown={onmove} onpointerleave={() => (hover = null)}>
        {#each scale.ticks as t, i (i)}
          <line class="grid" x1={pad.l} x2={width - pad.r} y1={scale.y(t)} y2={scale.y(t)} />
          <text class="tick" x={pad.l - 6} y={scale.y(t)} dy="0.32em" text-anchor="end">{fmt(t)}</text>
        {/each}
        <text class="tick" x={pad.l} y={height - 4}>{fmtDate(sorted[0].x)}</text>
        <text class="tick" x={width - pad.r} y={height - 4} text-anchor="end">{fmtDate(last!.x)}</text>

        {#if kind === 'bars'}
          {#each sorted as p, i (i)}
            <path class="bar" class:dim={hover !== null && hover !== i} fill={p.color ?? 'var(--chalk-dim)'}
              d={barPath(scale.x(p.x, i), scale.y(p.y), scale.y(scale.ticks[0]), Math.min(24, Math.max(2, scale.band - 2)))} />
          {/each}
        {:else}
          <path class="line" d={path} />
          {#each sorted as p, i (i)}
            {#if p.color || i === sorted.length - 1 || hover === i}
              <circle cx={scale.x(p.x, i)} cy={scale.y(p.y)} r={hover === i ? 6 : 4.5} fill={p.color ?? 'var(--chalk)'} class="dot" />
            {/if}
          {/each}
          <text class="end num" x={scale.x(last!.x, sorted.length - 1) + 9} y={scale.y(last!.y)} dy="0.32em">{fmt(last!.y)}</text>
        {/if}

        {#if hp && hover !== null}
          <line class="cross" x1={scale.x(hp.x, hover)} x2={scale.x(hp.x, hover)} y1={pad.t} y2={height - pad.b} />
        {/if}
      </svg>
      {#if hp && hover !== null}
        <div class="tip small" style:left="{Math.min(width - 150, Math.max(0, scale.x(hp.x, hover) - 75))}px">
          <strong class="num">{fmt(hp.y)} {unit}</strong>
          <span class="muted">{fmtDate(hp.x)}{hp.note ? `, ${hp.note}` : ''}</span>
        </div>
      {/if}
    </div>
    <details class="table small">
      <summary class="faint">Show as table</summary>
      <table>
        <thead><tr><th>Date</th><th>{unit}</th><th></th></tr></thead>
        <tbody>
          {#each [...sorted].reverse() as p, i (i)}
            <tr><td>{fmtDate(p.x)}</td><td class="num">{fmt(p.y)}</td><td class="muted">{p.note ?? ''}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</figure>

<style>
  .chart { margin: 0; display: grid; gap: 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--chalk-dim); justify-content: flex-end; }
  .key { display: inline-flex; align-items: center; gap: 6px; }
  .key i { width: 8px; height: 8px; border-radius: 50%; }
  .plot { position: relative; touch-action: pan-y; }
  svg { display: block; overflow: visible; }
  .grid { stroke: var(--iron-3); stroke-width: 1; }
  .tick { fill: var(--chalk-faint); font: 500 12px var(--font-num); }
  .line { fill: none; stroke: var(--chalk); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; opacity: 0.85; }
  .dot { stroke: var(--iron-1); stroke-width: 2; }
  .end { fill: var(--chalk); font-size: 14px; font-weight: 600; }
  .bar.dim { opacity: 0.45; }
  .cross { stroke: var(--chalk-faint); stroke-width: 1; }
  .tip {
    position: absolute; top: -6px; width: 150px; padding: 6px 10px; display: grid; pointer-events: none;
    border-radius: var(--r-sm); background: var(--iron-3); box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
  }
  .empty { margin: 8px 0; }
  .table summary { cursor: pointer; padding: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 500; color: var(--chalk-dim); }
  td, th { padding: 4px 0; border-bottom: 1px solid var(--line); }
</style>
