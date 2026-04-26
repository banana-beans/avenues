import type { Mode } from '@/storage/types.ts';

export function renderModeToggle(active: Mode): string {
  return `
    <div class="mode-toggle" role="tablist" aria-label="Activity mode">
      <button
        class="mode-btn ${active === 'bike' ? 'active' : ''}"
        data-action="set-mode"
        data-mode="bike"
        role="tab"
        aria-selected="${active === 'bike'}"
      >BIKE</button>
      <button
        class="mode-btn ${active === 'run' ? 'active' : ''}"
        data-action="set-mode"
        data-mode="run"
        role="tab"
        aria-selected="${active === 'run'}"
      >RUN</button>
    </div>
  `;
}
