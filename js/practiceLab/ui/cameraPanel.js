// The camera panel: a live mirror and a recorder.
//
// A live mirror finds a technique problem in the moment; a clip finds one
// after. The clip holds the microphone sound, so the player hears the notes
// and the click.

import { el, pressable, panel, notice } from './dom.js';
import { formatDuration } from '../model/session.js';
import { CLIP_CAPS } from '../container.js';

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createCameraPanel(lab) {
  const { video: videoPort, clock } = lab.ports;
  let elapsedTimer = null;
  let recordStartMs = 0;
  let mirrorOpen = false;
  let busy = false;

  const view = panel('Camera', 'pl-camera');

  const mirror = el('video', { class: 'pl-mirror', muted: true, playsInline: true, autoplay: true });
  mirror.setAttribute('aria-label', 'Camera mirror');
  const stage = el('div', { class: 'pl-mirror-stage' }, [mirror]);
  stage.hidden = true;

  const status = el('p', { class: 'pl-camera-status', text: 'The camera is off.' });
  status.setAttribute('aria-live', 'polite');
  const elapsed = el('p', { class: 'pl-camera-elapsed', text: '' });

  const openBtn = pressable({
    label: 'Open Camera',
    onPress: () => (mirrorOpen ? closeMirror() : openMirror()),
  });
  const recordBtn = pressable({
    label: '● Record',
    className: 'primary',
    disabled: true,
    onPress: () => (videoPort.isRecording?.() ? stopRecording('player') : startRecording()),
  });

  const caps = videoPort.capabilities();
  if (!caps.camera) {
    view.body.appendChild(notice('This device has no camera, or the browser blocks it.', 'warn'));
    openBtn.disabled = true;
    recordBtn.hidden = true;
  } else if (!caps.recorder) {
    view.body.appendChild(notice('This browser cannot record video. The mirror still works.', 'warn'));
    recordBtn.hidden = true;
  }

  function clearElapsedTimer() {
    if (elapsedTimer == null) return;
    clock.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  async function openMirror() {
    if (busy) return;
    busy = true;
    openBtn.disabled = true;
    try {
      const { stream } = await videoPort.openMirror();
      mirror.srcObject = stream;
      stage.hidden = false;
      mirrorOpen = true;
      openBtn.textContent = 'Close Camera';
      recordBtn.disabled = !caps.recorder;
      status.textContent = 'The mirror is live. Nothing is recorded yet.';
    } catch (error) {
      status.textContent = describeError(error);
    } finally {
      openBtn.disabled = false;
      busy = false;
    }
  }

  function describeError(error) {
    const name = error && error.name ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera permission denied. Allow camera access and try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera found on this device.';
    }
    return error && error.message ? error.message : 'Could not access the camera.';
  }

  function paintRecording(running) {
    recordBtn.textContent = running ? '■ Stop' : '● Record';
    recordBtn.classList.toggle('danger', running);
    stage.classList.toggle('recording', running);
  }

  async function startRecording() {
    if (!mirrorOpen) await openMirror();
    if (!mirrorOpen) return;
    try {
      await videoPort.startRecording({
        onCapReached: (reason) => stopRecording(reason),
      });
    } catch (error) {
      status.textContent = describeError(error);
      return;
    }
    recordStartMs = clock.nowMs();
    paintRecording(true);
    status.textContent = 'Recording.';
    elapsed.textContent = '0:00';
    elapsedTimer = clock.setInterval(() => {
      elapsed.textContent = formatDuration(clock.nowMs() - recordStartMs);
    }, 500);
  }

  async function stopRecording(reason) {
    clearElapsedTimer();
    const clip = await videoPort.stopRecording();
    paintRecording(false);
    elapsed.textContent = '';
    if (!clip || !clip.blob || !clip.blob.size) {
      status.textContent = 'The recording held nothing.';
      return;
    }
    const saved = await lab.saveClip(clip);
    if (!saved) {
      status.textContent = 'The clip could not be saved.';
      return;
    }
    if (reason === 'duration') {
      status.textContent = `Clip saved. The recorder stopped at the ${CLIP_CAPS.durationMs / 60000} minute cap.`;
    } else if (reason === 'size') {
      status.textContent = 'Clip saved. The recorder stopped at the size cap.';
    } else {
      status.textContent = `Clip saved — ${formatDuration(clip.durationMs)}.`;
    }
  }

  function closeMirror() {
    clearElapsedTimer();
    videoPort.close();
    mirror.srcObject = null;
    stage.hidden = true;
    mirrorOpen = false;
    paintRecording(false);
    openBtn.textContent = 'Open Camera';
    recordBtn.disabled = true;
    elapsed.textContent = '';
    status.textContent = 'The camera is off.';
  }

  view.body.append(
    stage,
    el('div', { class: 'pl-row' }, [openBtn, recordBtn]),
    status,
    elapsed,
    el('p', {
      class: 'pl-hint',
      text: `A clip stops itself at ${CLIP_CAPS.durationMs / 60000} minutes or ${Math.round(CLIP_CAPS.bytes / (1024 * 1024))} MB.`,
    }),
  );

  return {
    root: view.root,
    /** Stop the recorder and the camera when the tool closes. */
    stop() {
      if (videoPort.isRecording?.()) {
        // Save what the recorder holds rather than losing the take.
        stopRecording('close');
        return;
      }
      if (mirrorOpen) closeMirror();
      else videoPort.close();
    },
  };
}
