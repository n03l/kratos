<script lang="ts">
  // The app icon's mark (public/icon.svg) without its tile, so it sits on any surface.
  let { size = 24 }: { size?: number } = $props();
</script>

<svg class="logo" height={size} width={(size * 369) / 320} viewBox="100 92 369 320" aria-hidden="true">
  <rect x="152" y="100" width="18" height="312" rx="6" fill="var(--chalk-dim)" />
  <rect x="114" y="124" width="94" height="26" rx="7" fill="var(--plate-blue)" />
  <rect x="100" y="156" width="122" height="34" rx="8" fill="var(--plate-red)" />
  <rect x="100" y="322" width="122" height="34" rx="8" fill="var(--plate-red)" />
  <rect x="114" y="362" width="94" height="26" rx="7" fill="var(--plate-blue)" />
  <rect x="232" y="176" width="48" height="196" fill="var(--chalk)" />
  <path d="M280 314 338 372H400L310 282H280Z" fill="var(--chalk)" />
  <g transform="rotate(-45 280 281)">
    <rect x="400" y="274" width="90" height="14" rx="5" fill="var(--chalk-dim)" />
    <rect x="250" y="259" width="160" height="44" fill="var(--chalk)" />
    <rect x="420" y="224" width="26" height="114" rx="7" fill="var(--plate-red)" />
    <rect x="452" y="236" width="20" height="90" rx="6" fill="var(--plate-red)" />
  </g>
</svg>

<style>
  .logo { display: block; flex: none; }
</style>
