import { escapeHtml } from '../uxPrimitives.js';
import {
  getSession,
  sendOtp,
  verifyOtp,
  signOut,
  onAuthChange,
  exchangeCodeFromUrl,
  describeAuthError,
  listDevices,
  revokeDevice,
} from './auth.js';
import {
  isFileSyncEnabled,
  setFileSyncEnabled,
} from './blobSync.js';

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
let localError = null;

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

function lastSyncedText(status) {
  const ts = Math.max(status?.lastPullAt || 0, status?.lastPushAt || 0);
  if (!ts) return 'Not synced yet';
  return `Last synced ${formatTimeAgo(ts)}`;
}

function statusDotClass(status) {
  if (!status?.online) return 'warn';
  if (status?.state === 'error') return 'error';
  if (['reconciling', 'pushing', 'pulling'].includes(status?.state)) return 'busy';
  if (status?.state === 'paused') return 'warn';
  return 'ok';
}

function statusLabel(status) {
  if (!status?.signedIn) return '';
  if (!status.online || status.state === 'offline') return 'Offline — saved on this device';
  if (status.state === 'paused') return 'Paused';
  if (status.state === 'error') return 'Could not sync';
  if (['reconciling', 'pushing', 'pulling'].includes(status.state)) return 'Syncing…';
  return 'Up to date';
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
    <p class="sync-hint cloud-intro">Sign in with your email. Musi sends a 6-digit code.</p>
    <label class="cloud-field">
      <span class="cloud-field-label">Email</span>
      <input type="email" id="mp-cloud-email" class="cloud-input" inputmode="email" autocomplete="email" placeholder="you@example.com">
    </label>
    <div class="sync-btn-row">
      <button type="button" class="btn sm primary" id="mp-cloud-send">Send code</button>
    </div>
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

function renderFirstSync(status) {
  const ctx = status.firstSyncContext || {};
  const local = ctx.localCount ?? 0;
  const cloud = ctx.cloudCount ?? 0;
  return `
    <div class="cloud-panel cloud-first-sync">
      <div class="cloud-panel-title">Choose how to sync</div>
      <p class="sync-hint">This device has local data. Pick how to combine it with your cloud library.</p>
      <p class="sync-hint sync-hint-compact">Local items: ${local}. Cloud items: ${cloud}.</p>
      <p class="sync-hint sync-hint-compact cloud-backup-note">Musi downloads a ZIP backup before it replaces anything.</p>
      <div class="sync-btn-row cloud-choice-row">
        <button type="button" class="btn sm primary" data-first-sync="merge">Merge both</button>
        <button type="button" class="btn sm" data-first-sync="cloud">Keep the cloud copy</button>
        <button type="button" class="btn sm" data-first-sync="device">Keep this device</button>
      </div>
    </div>
  `;
}

function fileStatusText(status) {
  const uploads = status?.files?.uploads || 0;
  const downloads = status?.files?.downloads || 0;
  if (status?.files?.busy) return 'File sync is running…';
  if (uploads === 0 && downloads === 0) return 'Files are in step';
  const parts = [];
  if (uploads > 0) parts.push(`${uploads} to upload`);
  if (downloads > 0) parts.push(`${downloads} to download`);
  return `Files: ${parts.join(', ')}`;
}

function renderFileSyncControls(status) {
  const checked = isFileSyncEnabled() ? ' checked' : '';
  return `
    <div class="cloud-file-section">
      <p class="sync-estimate cloud-file-status">${escapeHtml(fileStatusText(status))}</p>
      <label class="cloud-toggle-row">
        <input type="checkbox" id="mp-cloud-file-sync"${checked}>
        <span>Sync exercise files and recordings on this device</span>
      </label>
      <div class="sync-btn-row cloud-file-actions">
        <button type="button" class="btn sm" id="mp-cloud-sync-files">Sync files now</button>
      </div>
    </div>
  `;
}

function renderMassDelete(status) {
  const md = status.massDelete || {};
  return `
    <div class="cloud-panel cloud-mass-delete">
      <div class="cloud-panel-title">Large delete detected</div>
      <p class="sync-hint">
        ${escapeHtml(String(md.count ?? 0))} of ${escapeHtml(String(md.total ?? 0))}
        ${escapeHtml(md.domain || 'items')} will be removed on other devices.
      </p>
      <div class="sync-btn-row">
        <button type="button" class="btn sm primary" data-mass-delete="push">Push deletes</button>
        <button type="button" class="btn sm sync-btn-secondary" data-mass-delete="cancel">Cancel</button>
      </div>
    </div>
  `;
}

function renderSignedIn(status, devices) {
  const dotClass = statusDotClass(status);
  const label = statusLabel(status);
  const errMsg = localError || status.error;
  const deviceRows = (devices || []).map((d) => renderDeviceRow(d, status.deviceId)).join('');

  return `
    <div class="cloud-signed-in-head">
      <p class="cloud-email-readout">${escapeHtml(status.email || '')}</p>
      <div class="cloud-status-row">
        <span class="cloud-status-dot ${dotClass}" aria-hidden="true"></span>
        <span class="cloud-status-label">${escapeHtml(label)}</span>
      </div>
      <p class="sync-estimate cloud-last-sync">${escapeHtml(lastSyncedText(status))}</p>
    </div>

    ${status.firstSyncNeeded ? renderFirstSync(status) : ''}
    ${status.massDelete ? renderMassDelete(status) : ''}

    ${errMsg ? `
      <div class="sync-qr-warning cloud-error-banner" role="alert">
        ${escapeHtml(typeof errMsg === 'string' ? errMsg : errMsg?.message || 'Could not sync')}
        <div class="sync-btn-row cloud-error-actions">
          <button type="button" class="btn sm primary" id="mp-cloud-retry">Try again</button>
        </div>
      </div>
    ` : ''}

    <div class="cloud-device-section">
      <div class="sync-scopes-label">Devices</div>
      <div class="cloud-device-list">
        ${deviceRows || '<p class="sync-hint">No devices registered yet.</p>'}
      </div>
    </div>

    ${renderFileSyncControls(status)}

    <div class="sync-btn-row cloud-action-row">
      <button type="button" class="btn sm primary" id="mp-cloud-sync-now">Sync now</button>
      <button type="button" class="btn sm" id="mp-cloud-push">Send this device to the cloud</button>
      <button type="button" class="btn sm" id="mp-cloud-pull">Get the cloud copy</button>
    </div>

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
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      files: {
        uploads: 0,
        downloads: 0,
        busy: false,
        lastError: null,
      },
    };
  }
  return api.getSyncStatus();
}

async function paint() {
  if (!rootEl) return;

  if (syncUnavailable) {
    rootEl.innerHTML = renderUnavailable();
    return;
  }

  const session = await getSession();
  const signedIn = !!session;

  if (!signedIn && uiState === 'signed-in') uiState = 'signed-out';
  if (signedIn) uiState = 'signed-in';

  if (uiState === 'signed-out') {
    rootEl.innerHTML = renderSignedOut();
    wireSignedOut();
    return;
  }

  if (uiState === 'code-sent') {
    rootEl.innerHTML = renderCodeSent();
    wireCodeSent();
    return;
  }

  const status = await getStatusSnapshot();
  const { devices } = await listDevices();
  rootEl.innerHTML = renderSignedIn(status, devices);
  wireSignedIn(status);
}

function wireSignedOut() {
  const emailInput = rootEl.querySelector('#mp-cloud-email');
  const sendBtn = rootEl.querySelector('#mp-cloud-send');
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
      localError = null;
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

function wireSignedIn(status) {
  const api = syncApi;

  rootEl.querySelector('#mp-cloud-sync-now')?.addEventListener('click', async () => {
    if (api?.syncNow) await api.syncNow();
  });

  rootEl.querySelector('#mp-cloud-push')?.addEventListener('click', async () => {
    if (api?.pushNow) await api.pushNow();
  });

  rootEl.querySelector('#mp-cloud-pull')?.addEventListener('click', async () => {
    if (api?.pullNow) await api.pullNow();
  });

  rootEl.querySelector('#mp-cloud-file-sync')?.addEventListener('change', (event) => {
    setFileSyncEnabled(event.target.checked);
    refreshCloudUI();
  });

  rootEl.querySelector('#mp-cloud-sync-files')?.addEventListener('click', async () => {
    if (api?.syncFilesNow) await api.syncFilesNow();
  });

  rootEl.querySelector('#mp-cloud-retry')?.addEventListener('click', async () => {
    localError = null;
    if (api?.syncNow) await api.syncNow();
    refreshCloudUI();
  });

  rootEl.querySelector('#mp-cloud-signout')?.addEventListener('click', async () => {
    eraseConfirmArmed = false;
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
    await signOut();
    if (api?.handleSignedOut) await api.handleSignedOut({ eraseLocal: true });
    uiState = 'signed-out';
    pendingEmail = '';
    await paint();
  });

  rootEl.querySelectorAll('[data-first-sync]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const choice = btn.getAttribute('data-first-sync');
      if (api?.resolveFirstSync) await api.resolveFirstSync(choice);
    });
  });

  rootEl.querySelectorAll('[data-mass-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const choice = btn.getAttribute('data-mass-delete');
      if (api?.resolveMassDelete) await api.resolveMassDelete(choice);
    });
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

export async function mountCloudUI(root) {
  unmountCloudUI();
  rootEl = root;
  syncApi = null;
  syncUnavailable = false;
  eraseConfirmArmed = false;
  localError = null;

  await exchangeCodeFromUrl();
  await loadSyncApi();

  const session = await getSession();
  uiState = session ? 'signed-in' : 'signed-out';

  authUnsub = onAuthChange((event) => {
    if (event === 'SIGNED_OUT') {
      uiState = 'signed-out';
      eraseConfirmArmed = false;
    } else if (event === 'SIGNED_IN') {
      uiState = 'signed-in';
    }
    refreshCloudUI();
  });

  const api = syncApi;
  if (api?.onSyncStatus) {
    statusUnsub = api.onSyncStatus(() => refreshCloudUI());
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
  localError = null;
}

export function refreshCloudUI() {
  paint().catch(() => { /* ignore */ });
}
