// Shared tempo bounds for the Guitar Pro player and exercise persistence.

export const GPP_MIN_BPM = 40;
export const GPP_MAX_BPM = 320;
export const GPP_MIN_TEMPO_PCT = 25;
export const GPP_MAX_TEMPO_PCT = 300;

export function clampBpm(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return GPP_MIN_BPM;
  return Math.max(GPP_MIN_BPM, Math.min(GPP_MAX_BPM, n));
}

export function clampTempoPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return GPP_MIN_TEMPO_PCT;
  return Math.max(GPP_MIN_TEMPO_PCT, Math.min(GPP_MAX_TEMPO_PCT, n));
}
