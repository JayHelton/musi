/**
 * Core sample pack catalog. Fetches manifests and registers them.
 */

import { registerPack, getPack } from './samplePackRegistry.js';

export const CORE_PACK_IDS = [
  'core-guitar',
  'core-guitar-steel',
  'core-guitar-drive',
  'core-bass',
  'core-keys',
  'core-drums',
];

function manifestUrl(packId) {
  return `assets/audio/packs/${packId}/manifest.json`;
}

/**
 * Fetch and register all core packs. Idempotent. Never throws.
 * @returns {Promise<{ ok: boolean, registered: string[], errors: string[] }>}
 */
export async function registerCorePacks() {
  const registered = [];
  const errors = [];

  for (const packId of CORE_PACK_IDS) {
    try {
      if (getPack(packId)) {
        registered.push(packId);
        continue;
      }
      const url = manifestUrl(packId);
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`${packId}: fetch failed (${response.status}).`);
        continue;
      }
      const json = await response.json();
      const result = registerPack(json);
      if (result.ok) {
        registered.push(packId);
      } else {
        errors.push(`${packId}: ${result.error}`);
      }
    } catch (e) {
      errors.push(`${packId}: ${e?.message || String(e)}`);
    }
  }

  return { ok: errors.length === 0, registered, errors };
}
