// Module worker entry for Guitar Pro parse. Keeps the main thread free.
import { parseGuitarPro } from './guitarPro.js';

self.addEventListener('message', async (event) => {
  const { id, bytes } = event.data || {};
  try {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    self.postMessage({ type: 'progress', ratio: 0, id });
    const gp = await parseGuitarPro(input);
    self.postMessage({ type: 'progress', ratio: 1, id });
    self.postMessage({ type: 'result', gp, id });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err?.message || String(err),
      id,
    });
  }
});
