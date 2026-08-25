// The notify port over the shared app toast.

import { showAppToast } from '../../appToast.js';

/** @returns {Object} a NotifyPort */
export function createMusiToast() {
  return {
    toast(message, kind = 'warn') {
      showAppToast(message, { kind });
    },
  };
}
