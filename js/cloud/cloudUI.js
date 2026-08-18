import { escapeHtml } from '../uxPrimitives.js';
import {
  getSession,
  sendOtp,
  verifyOtp,
  signInWithGoogle,
  signOut,
  onAuthChange,
  exchangeCodeFromUrl,
  describeAuthError,
  listDevices,
  revokeDevice,
} from './auth.js';

/** The three sync operations, in the order the panel shows them. */
const SYNC_ACTIONS = [
  {
    mode: 'merge',
    label: 'Merge',
    hint: 'Add what each side is missing. Nothing is deleted.',
    danger: false,
  },
  {
    mode: 'cloud',
    label: 'Get the cloud copy',
    hint: 'Clear this device, then copy the cloud library onto it. Musi downloads a ZIP backup first.',
    danger: true,
  },
  {
    mode: 'device',
    label: 'Send this device',
    hint: 'Clear the cloud, then copy this library into it.',
    danger: true,
  },
];

let rootEl = null;
let syncApi = null;
let syncUnavailable = false;
let uiState = 'signed-out';
let pendingEmail = '';
let resendTimer = null;
let resendEndsAt = 0;
let statusUnsub = null;
let authUnsub = null;
let onlineUnsub = null;
let eraseConfirmArmed = false;
let armedMode = null;
let devicesOpen = false;
let cachedDevices = [];
let lastStructuralSig = null;

async function loadSyncApi() {
  if (syncApi) return syncApi;
  try {
    syncApi = await import('./cloudSync.js');
    syncUnavailable = false;
    return syncApi;
  } catch (_) {
    syncUnavailable = true;
    return null;
  }
}

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function modeLabel(mode) {
  const action = SYNC_ACTIONS.find((a) => a.mode === mode);
  return action ? action.label : '';
}

function lastSyncedText(status) {
  if (!status?.lastSyncAt) return 'Not synced yet';
  const when = formatTimeAgo(status.lastSyncAt);
  const label = modeLabel(status.lastSyncMode);
  return label ? `${label} · ${when}` : `Last synced ${when}`;
}

function countsText(status) {
  if (!status?.signedIn) return '';
  const local = status.localCount ?? 0;
  const cloud = status.cloudCount ?? 0;
  const files = status.files || {};
  const parts = [`This device: ${local} items`, `Cloud: ${cloud} items`];
  const changed = status.pendingChanges || 0;
  if (changed > 0) parts.push(`${changed} changed since the last sync`);
  const pendingFiles = (files.uploads || 0) + (files.downloads || 0);
  if (pendingFiles > 0) parts.push(`${pendingFiles} files differ`);
  return parts.join(' · ');
}

function statusDotClass(status) {
  if (!status?.online) return 'warn';
  if (status?.state === 'error') return 'error';
  if (['merging', 'pushing', 'pulling'].includes(status?.state) || status?.files?.busy) return 'busy';
  return 'ok';
}

function statusLabel(status) {
  if (!status?.signedIn) return '';
  if (!status.online || status.state === 'offline') return 'Offline — saved on this device';
  if (status.state === 'error') return 'Could not sync';
  // The file pass runs after the record pass, so the record state still reads
  // "pulling" while a file moves. Name the real work instead.
  if (status.files?.busy) {
    if (status.files.phase === 'upload') return 'Sending files…';
    if (status.files.phase === 'download') return 'Getting files…';
    return 'Checking files…';
  }
  if (status.state === 'merging') return 'Merging…';
  if (status.state === 'pushing') return 'Sending this device…';
  if (status.state === 'pulling') return 'Getting the cloud copy…';
  if (!status.lastSyncAt) return 'Ready to sync';
  return 'Synced';
}

function isBusy(status) {
  return ['merging', 'pushing', 'pulling'].includes(status?.state) || !!status?.files?.busy;
}

function clearTimers() {
  if (resendTimer) {
    clearInterval(resendTimer);
    resendTimer = null;
  }
}

function startResendCountdown(ms = 60_000) {
  clearTimers();
  resendEndsAt = Date.now() + ms;
  resendTimer = setInterval(() => {
    if (Date.now() >= resendEndsAt) {
      clearTimers();
    }
    refreshCloudUI();
  }, 1000);
}

function resendSecondsLeft() {
  return Math.max(0, Math.ceil((resendEndsAt - Date.now()) / 1000));
}

function renderSignedOut() {
  return `
    <p class="sync-hint cloud-intro">Sign in with your Google account to sync this library.</p>
    <div class="sync-btn-row cloud-google-row">
      <button type="button" class="btn sm primary cloud-google-btn" id="mp-cloud-google">Continue with Google</button>
    </div>
    <details class="sync-advanced cloud-email-fallback">
      <summary class="sync-advanced-summary">Sign in with an email code instead</summary>
      <label class="cloud-field">
        <span class="cloud-field-label">Email</span>
        <input type="email" id="mp-cloud-email" class="cloud-input" inputmode="email" autocomplete="email" placeholder="you@example.com">
      </label>
      <div class="sync-btn-row">
        <button type="button" class="btn sm primary" id="mp-cloud-send">Send code</button>
      </div>
    </details>
    <div class="cloud-inline-error" id="mp-cloud-error" hidden></div>
  `;
}

function renderCodeSent() {
  const left = resendSecondsLeft();
  const resendDisabled = left > 0;
  return `
    <p class="sync-hint cloud-intro">Enter the 6-digit code from your email. If the email holds a link instead, open the link on this device.</p>
    <p class="cloud-email-readout">${escapeHtml(pendingEmail)}</p>
    <label class="cloud-field">
      <span class="cloud-field-label">Code</span>
      <input type="text" id="mp-cloud-code" class="cloud-input cloud-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*">
    </label>
    <div class="sync-btn-row">
      <button type="button" class="btn sm primary" id="mp-cloud-verify">Verify</button>
      <button type="button" class="btn sm sync-btn-secondary" id="mp-cloud-resend"${resendDisabled ? ' disabled' : ''}>
        ${resendDisabled ? `Resend (${left}s)` : 'Resend code'}
      </button>
    </div>
    <button type="button" class="cloud-link-btn" id="mp-cloud-change-email">Use another email</button>
    <div class="cloud-inline-error" id="mp-cloud-error" hidden></div>
  `;
}

function renderDeviceRow(device, currentDeviceId) {
  const isThis = device.device_id === currentDeviceId;
  const name = device.name || device.platform || 'Device';
  const seen = device.last_seen_at ? formatTimeAgo(new Date(device.last_seen_at).getTime()) : '';
  return `
    <div class="cloud-device-row">
      <div class="cloud-device-meta">
        <div class="cloud-device-name">
          ${escapeHtml(name)}
          ${isThis ? '<span class="cloud-device-badge">This device</span>' : ''}
        </div>
        <div class="cloud-device-sub">${escapeHtml(device.platform || '')}${seen ? ` · last seen ${escapeHtml(seen)}` : ''}</div>
      </div>
      ${isThis ? '' : `<button type="button" class="btn sm sync-btn-secondary cloud-revoke-btn" data-device-id="${escapeHtml(device.device_id)}">Revoke</button>`}
    </div>
  `;
}

function renderDeviceSection(status, devices) {
  const rows = (devices || []).map((d) => renderDeviceRow(d, status.deviceId)).join('');
  const count = (devices || []).length;
  const summary = count === 1 ? 'Devices with access (1)' : `Devices with access (${count})`;
  return `
    <details class="sync-advanced cloud-device-section" id="mp-cloud-devices"${devicesOpen ? ' open' : ''}>
      <summary class="sync-advanced-summary">${escapeHtml(summary)}</summary>
      <div class="cloud-device-list">
        ${rows || '<p class="sync-hint">No devices registered yet.</p>'}
      </div>
    </details>
  `;
}

function fileStatusText(status) {
  const files = status?.files || {};
  if (files.busy) {
    if (files.total > 0 && files.phase) {
      const verb = files.phase === 'upload' ? 'upload' : 'download';
      return `Files: ${verb} ${files.done} of ${files.total}`;
    }
    return 'Files: the check is running';
  }
  const uploads = files.uploads || 0;
  const downloads = files.downloads || 0;
  if (uploads === 0 && downloads === 0) return 'Files are in step';
  const parts = [];
  if (uploads > 0) parts.push(`${uploads} to upload`);
  if (downloads > 0) parts.push(`${downloads} to download`);
  return `Files: ${parts.join(', ')}`;
}

function fileProgressWidth(status) {
  const files = status?.files || {};
  if (!files.busy || !files.total) return 0;
  return Math.min(100, Math.round((files.done / files.total) * 100));
}

function showFileProgress(status) {
  const files = status?.files || {};
  return files.busy && files.total > 0;
}

function renderSyncActions(status) {
  const busy = isBusy(status);
  const rows = SYNC_ACTIONS.map((action) => {
    const armed = armedMode === action.mode;
    const label = armed ? 'Click again to confirm' : action.label;
    const classes = [
      'btn',
      'sm',
      action.danger ? 'cloud-danger-btn' : 'primary',
      'cloud-sync-btn',
    ].join(' ');
    return `
      <div class="cloud-sync-choice${armed ? ' armed' : ''}">
        <button type="button" class="${classes}" data-sync-mode="${action.mode}"${busy ? ' disabled' : ''}>
          ${escapeHtml(label)}
        </button>
        <p class="cloud-sync-hint">${escapeHtml(action.hint)}</p>
      </div>
    `;
  }).join('');

  const progressHidden = showFileProgress(status) ? '' : ' hidden';
  const progressWidth = fileProgressWidth(status);

  return `
    <div class="cloud-sync-section">
      <div class="sync-scopes-label">Sync</div>
      <p class="sync-hint sync-hint-compact">Musi syncs only when you press a button. Each pass leaves this device and the cloud the same.</p>
      <div class="cloud-sync-choices">${rows}</div>
      <p class="sync-estimate cloud-file-status" id="mp-cloud-file-status">${escapeHtml(fileStatusText(status))}</p>
      <div class="cloud-progress" id="mp-cloud-progress"${progressHidden}>
        <div class="cloud-progress-bar"><span class="cloud-progress-fill" style="width: ${progressWidth}%"></span></div>
      </div>
    </div>
  `;
}

function renderSignedIn(status, devices) {
  const dotClass = statusDotClass(status);
  const label = statusLabel(status);
  const errMsg = status.error;

  return `
    <div class="cloud-signed-in-head">
      <p class="cloud-email-readout">${escapeHtml(status.email || '')}</p>
      <div class="cloud-status-row">
        <span class="cloud-status-dot ${dotClass}" id="mp-cloud-status-dot" aria-hidden="true"></span>
        <span class="cloud-status-label" id="mp-cloud-status-label">${escapeHtml(label)}</span>
      </div>
      <p class="sync-estimate cloud-last-sync" id="mp-cloud-last-sync">${escapeHtml(lastSyncedText(status))}</p>
      <p class="sync-estimate cloud-counts" id="mp-cloud-counts">${escapeHtml(countsText(status))}</p>
    </div>

    ${errMsg ? `
      <div class="sync-qr-warning cloud-error-banner" role="alert">
        ${escapeHtml(typeof errMsg === 'string' ? errMsg : errMsg?.message || 'Could not sync')}
      </div>
    ` : ''}

    ${renderSyncActions(status)}

    ${renderDeviceSection(status, devices)}

    <div class="sync-btn-row cloud-signout-row">
      <button type="button" class="btn sm sync-btn-secondary" id="mp-cloud-signout">Sign out</button>
      <button type="button" class="btn sm sync-btn-secondary cloud-danger-btn" id="mp-cloud-signout-erase">
        ${eraseConfirmArmed ? 'Click again to erase' : 'Sign out and erase this device'}
      </button>
    </div>
  `;
}

function renderUnavailable() {
  return `<p class="sync-hint">Cloud sync is not available.</p>`;
}

function showInlineError(message) {
  const el = rootEl?.querySelector('#mp-cloud-error');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

async function getStatusSnapshot() {
  const api = await loadSyncApi();
  if (!api?.getSyncStatus) {
    return {
      state: 'signed-out',
      signedIn: false,
      email: null,
      userId: null,
      deviceId: null,
      lastSyncAt: null,
      lastSyncMode: null,
      localCount: 0,
      cloudCount: 0,
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      files: {
        uploads: 0,
        downloads: 0,
        busy: false,
        lastError: null,
        phase: null,
        done: 0,
        total: 0,
      },
    };
  }
  return api.getSyncStatus();
}

function computeStructuralSig(status, devices) {
  return JSON.stringify({
    uiState,
    hasError: !!status.error,
    busy: isBusy(status),
    eraseConfirmArmed,
    armedMode,
    devices: (devices || []).map((d) => d.device_id).sort().join('|'),
  });
}

function updateLiveStatus(status) {
  if (!rootEl) return;

  const dot = rootEl.querySelector('#mp-cloud-status-dot');
  if (dot) {
    dot.className = `cloud-status-dot ${statusDotClass(status)}`;
  }

  const label = rootEl.querySelector('#mp-cloud-status-label');
  if (label) label.textContent = statusLabel(status);

  const lastSync = rootEl.querySelector('#mp-cloud-last-sync');
  if (lastSync) lastSync.textContent = lastSyncedText(status);

  const counts = rootEl.querySelector('#mp-cloud-counts');
  if (counts) counts.textContent = countsText(status);

  const fileStatus = rootEl.querySelector('#mp-cloud-file-status');
  if (fileStatus) fileStatus.textContent = fileStatusText(status);

  const progress = rootEl.querySelector('#mp-cloud-progress');
  const fill = rootEl.querySelector('.cloud-progress-fill');
  const visible = showFileProgress(status);
  if (progress) progress.hidden = !visible;
  if (fill) fill.style.width = `${fileProgressWidth(status)}%`;
}

async function paint() {
  if (!rootEl) return;

  if (syncUnavailable) {
    rootEl.innerHTML = renderUnavailable();
    lastStructuralSig = null;
    return;
  }

  const session = await getSession();
  const signedIn = !!session;

  if (!signedIn && uiState === 'signed-in') uiState = 'signed-out';
  if (signedIn) uiState = 'signed-in';

  if (uiState === 'signed-out') {
    rootEl.innerHTML = renderSignedOut();
    lastStructuralSig = null;
    wireSignedOut();
    return;
  }

  if (uiState === 'code-sent') {
    rootEl.innerHTML = renderCodeSent();
    lastStructuralSig = null;
    wireCodeSent();
    return;
  }

  const status = await getStatusSnapshot();
  const { devices } = await listDevices();
  cachedDevices = devices || [];
  lastStructuralSig = computeStructuralSig(status, cachedDevices);
  rootEl.innerHTML = renderSignedIn(status, cachedDevices);
  wireSignedIn();
}

function wireSignedOut() {
  const googleBtn = rootEl.querySelector('#mp-cloud-google');
  const emailInput = rootEl.querySelector('#mp-cloud-email');
  const sendBtn = rootEl.querySelector('#mp-cloud-send');

  if (googleBtn) {
    googleBtn.onclick = async () => {
      googleBtn.disabled = true;
      showInlineError('');
      const result = await signInWithGoogle();
      if (!result.ok) {
        const described = describeAuthError(result.error);
        showInlineError(described.message);
        googleBtn.disabled = false;
      }
    };
  }

  if (!sendBtn || !emailInput) return;

  sendBtn.onclick = async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showInlineError('Enter your email address.');
      return;
    }
    sendBtn.disabled = true;
    showInlineError('');
    const result = await sendOtp(email);
    if (!result.ok) {
      const described = describeAuthError(result.error);
      showInlineError(described.message);
      if (described.retryAfterMs) startResendCountdown(described.retryAfterMs);
      sendBtn.disabled = false;
      return;
    }
    pendingEmail = email;
    uiState = 'code-sent';
    startResendCountdown(60_000);
    await paint();
  };
}

function wireCodeSent() {
  const codeInput = rootEl.querySelector('#mp-cloud-code');
  const verifyBtn = rootEl.querySelector('#mp-cloud-verify');
  const resendBtn = rootEl.querySelector('#mp-cloud-resend');
  const changeBtn = rootEl.querySelector('#mp-cloud-change-email');

  if (codeInput) codeInput.focus();

  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      const token = (codeInput?.value || '').trim();
      if (token.length !== 6) {
        showInlineError('Enter the 6-digit code.');
        return;
      }
      verifyBtn.disabled = true;
      showInlineError('');
      const result = await verifyOtp(pendingEmail, token);
      if (!result.ok) {
        const described = describeAuthError(result.error);
        showInlineError(described.message);
        verifyBtn.disabled = false;
        return;
      }
      const api = await loadSyncApi();
      if (api?.handleSignedIn) await api.handleSignedIn();
      uiState = 'signed-in';
      eraseConfirmArmed = false;
      armedMode = null;
      await paint();
    };
  }

  if (resendBtn) {
    resendBtn.onclick = async () => {
      if (resendSecondsLeft() > 0) return;
      resendBtn.disabled = true;
      const result = await sendOtp(pendingEmail);
      if (!result.ok) {
        const described = describeAuthError(result.error);
        showInlineError(described.message);
        if (described.retryAfterMs) startResendCountdown(described.retryAfterMs);
      } else {
        startResendCountdown(60_000);
      }
      resendBtn.disabled = false;
      await paint();
    };
  }

  if (changeBtn) {
    changeBtn.onclick = () => {
      uiState = 'signed-out';
      pendingEmail = '';
      clearTimers();
      paint();
    };
  }
}

function wireSignedIn() {
  const api = syncApi;

  const details = rootEl.querySelector('#mp-cloud-devices');
  if (details) {
    details.addEventListener('toggle', () => {
      devicesOpen = details.open;
    });
  }

  rootEl.querySelectorAll('[data-sync-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-sync-mode');
      const action = SYNC_ACTIONS.find((a) => a.mode === mode);
      if (!action) return;
      if (action.danger && armedMode !== mode) {
        armedMode = mode;
        refreshCloudUI();
        return;
      }
      armedMode = null;
      if (api?.runSync) await api.runSync(mode);
      refreshCloudUI();
    });
  });

  rootEl.querySelector('#mp-cloud-signout')?.addEventListener('click', async () => {
    eraseConfirmArmed = false;
    armedMode = null;
    await signOut();
    if (api?.handleSignedOut) await api.handleSignedOut({ eraseLocal: false });
    uiState = 'signed-out';
    pendingEmail = '';
    await paint();
  });

  rootEl.querySelector('#mp-cloud-signout-erase')?.addEventListener('click', async () => {
    if (!eraseConfirmArmed) {
      eraseConfirmArmed = true;
      refreshCloudUI();
      return;
    }
    eraseConfirmArmed = false;
    armedMode = null;
    await signOut();
    if (api?.handleSignedOut) await api.handleSignedOut({ eraseLocal: true });
    uiState = 'signed-out';
    pendingEmail = '';
    await paint();
  });

  rootEl.querySelectorAll('.cloud-revoke-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const deviceId = btn.getAttribute('data-device-id');
      if (!deviceId) return;
      btn.disabled = true;
      await revokeDevice(deviceId);
      refreshCloudUI();
    });
  });
}

/** Tests read the signed-in markup through this hook. */
export function __renderSignedInForTests(status, devices) {
  return renderSignedIn(status, devices);
}

export async function mountCloudUI(root) {
  unmountCloudUI();
  rootEl = root;
  syncApi = null;
  syncUnavailable = false;
  eraseConfirmArmed = false;
  armedMode = null;
  devicesOpen = false;
  cachedDevices = [];

  await exchangeCodeFromUrl();
  await loadSyncApi();

  const session = await getSession();
  uiState = session ? 'signed-in' : 'signed-out';

  authUnsub = onAuthChange((event) => {
    if (event === 'SIGNED_OUT') {
      uiState = 'signed-out';
      eraseConfirmArmed = false;
      armedMode = null;
    } else if (event === 'SIGNED_IN') {
      uiState = 'signed-in';
    }
    refreshCloudUI();
  });

  const api = syncApi;
  if (api?.onSyncStatus) {
    // The device list changes only on sign-in or on a revoke, so the status
    // stream reuses the cached list and never calls the network on a tick.
    statusUnsub = api.onSyncStatus((status) => {
      if (!rootEl || uiState !== 'signed-in' || syncUnavailable) {
        refreshCloudUI();
        return;
      }
      const sig = computeStructuralSig(status, cachedDevices);
      if (
        lastStructuralSig !== null
        && sig === lastStructuralSig
        && rootEl.querySelector('#mp-cloud-status-dot')
      ) {
        updateLiveStatus(status);
        return;
      }
      lastStructuralSig = sig;
      rootEl.innerHTML = renderSignedIn(status, cachedDevices);
      wireSignedIn();
    });
  }

  if (typeof window !== 'undefined') {
    const onOnline = () => refreshCloudUI();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    onlineUnsub = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
    };
  }

  await paint();

  // The counts drive the choice of direction, so read them once on mount.
  if (api?.refreshCounts) api.refreshCounts().catch(() => { /* ignore */ });
}

export function unmountCloudUI() {
  clearTimers();
  if (statusUnsub) {
    statusUnsub();
    statusUnsub = null;
  }
  if (authUnsub) {
    authUnsub();
    authUnsub = null;
  }
  if (onlineUnsub) {
    onlineUnsub();
    onlineUnsub = null;
  }
  if (rootEl) rootEl.innerHTML = '';
  rootEl = null;
  syncApi = null;
  pendingEmail = '';
  uiState = 'signed-out';
  eraseConfirmArmed = false;
  armedMode = null;
  devicesOpen = false;
  cachedDevices = [];
  lastStructuralSig = null;
}

export function refreshCloudUI() {
  paint().catch(() => { /* ignore */ });
}
