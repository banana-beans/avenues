/**
 * "DATA" section — backup, restore, and a privacy reassurance line.
 *
 * Lives below the ride log. The hidden file input is co-located here so the
 * import flow is a tap on the IMPORT button (which proxies to the input).
 */

export function renderDataPanel(): string {
  return `
    <div class="data-wrap">
      <div class="section-head">
        <div class="section-title">DATA</div>
        <div class="section-sub">stays on this device · export to back up</div>
      </div>
      <div class="data-actions">
        <button class="btn" data-action="export-data">EXPORT</button>
        <button class="btn" data-action="import-data">IMPORT</button>
        <button class="btn" data-action="reset-defaults">RESET TO DEFAULTS</button>
        <span class="data-note">Locations + ride log live in your browser. Nothing is sent anywhere.</span>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden />
    </div>
  `;
}
