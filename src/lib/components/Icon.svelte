<script lang="ts" module>
  // 24px stroke icons. Paths are static strings, never data.
  const paths = {
    today: 'M4 7h16M4 7v12h16V7M4 7l2-3h12l2 3M9 12h6',
    history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
    exercises: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
    progress: 'M4 19h16M6 15l4-4 3 3 5-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    back: 'M15 5l-7 7 7 7',
    chevron: 'M9 6l6 6-6 6',
    menu: 'M12 5h.01M12 12h.01M12 19h.01',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
    unlink: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1M4 4l16 16',
    trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    timer: 'M12 8v5l2 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
    pin: 'M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
    edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    archive: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4',
    routine: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    play: 'M8 5.5v13l10.5-6.5Z',
    stop: 'M7 7h10v10H7Z',
    cloud: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 9.6 4.75 4.75 0 0 0 7 19Z',
  } as const;
  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
