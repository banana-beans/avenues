/**
 * Location modal — imperative because the modal markup lives in index.html.
 *
 * `openLocationModal` populates inputs and shows the modal.
 * `closeLocationModal` hides it.
 * `readLocationForm` serializes the inputs back to a Location-shaped value.
 */

import type { Location, LocationRole } from '@/storage/types.ts';

import { makeLocationId } from './format.ts';

export interface LocationFormResult {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly role: LocationRole;
}

export function openLocationModal(existing: Location | null): void {
  const title = byId('modalTitle');
  const idInput = byId<HTMLInputElement>('locId');
  const nameInput = byId<HTMLInputElement>('locName');
  const latInput = byId<HTMLInputElement>('locLat');
  const lonInput = byId<HTMLInputElement>('locLon');
  const roleSelect = byId<HTMLSelectElement>('locRole');
  const deleteBtn = byId<HTMLButtonElement>('modalDelete');
  const modal = byId('locModal');

  title.textContent = existing ? 'EDIT LOCATION' : 'ADD LOCATION';
  idInput.value = existing?.id ?? '';
  nameInput.value = existing?.name ?? '';
  latInput.value = existing ? String(existing.lat) : '';
  lonInput.value = existing ? String(existing.lon) : '';
  roleSelect.value = existing?.role ?? 'secondary';
  deleteBtn.style.display = existing ? 'inline-block' : 'none';

  modal.classList.add('show');
  nameInput.focus();
}

export function closeLocationModal(): void {
  byId('locModal').classList.remove('show');
}

export function readLocationForm(): LocationFormResult | null {
  const id = byId<HTMLInputElement>('locId').value;
  const name = byId<HTMLInputElement>('locName').value.trim().toUpperCase();
  const lat = parseFloat(byId<HTMLInputElement>('locLat').value);
  const lon = parseFloat(byId<HTMLInputElement>('locLon').value);
  const role = byId<HTMLSelectElement>('locRole').value as LocationRole;

  if (!name || Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return {
    id: id || makeLocationId(),
    name,
    lat,
    lon,
    role,
  };
}

export function getEditingLocationId(): string | null {
  const id = byId<HTMLInputElement>('locId').value;
  return id === '' ? null : id;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not in DOM — index.html out of sync?`);
  return el as T;
}
