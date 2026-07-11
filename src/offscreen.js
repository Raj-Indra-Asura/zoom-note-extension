'use strict';

let captureStream = null;
let audioContext = null;
let sourceNode = null;
let mediaRecorder = null;
let rotationTimer = null;
let currentChunks = [];
let chunkIndex = 0;
let chunkDurationMs = 180000;
let sessionStartEpoch = 0;
let currentChunkStartEpoch = 0;
let stopRequested = false;
let cancelRequested = false;
let isStarting = false;
let activeMimeType = 'audio/webm';

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function clearRotationTimer() {
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
}

function chooseMimeType() {
  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }
    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm';
    }
  }
  return '';
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function stopTracksAndAudio() {
  if (captureStream) {
    captureStream.getTracks().forEach((track) => track.stop());
  }
  if (sourceNode) {
    sourceNode.disconnect();
  }
  if (audioContext && audioContext.state !== 'closed') {
    void audioContext.close();
  }
  captureStream = null;
  audioContext = null;
  sourceNode = null;
}

function resetState() {
  clearRotationTimer();
  currentChunks = [];
  chunkIndex = 0;
  chunkDurationMs = 180000;
  sessionStartEpoch = 0;
  currentChunkStartEpoch = 0;
  stopRequested = false;
  cancelRequested = false;
  isStarting = false;
  mediaRecorder = null;
  activeMimeType = 'audio/webm';
}

async function cleanup() {
  clearRotationTimer();
  stopTracksAndAudio();
  resetState();
}

function scheduleRotation() {
  clearRotationTimer();
  if (stopRequested || cancelRequested) {
    return;
  }
  rotationTimer = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }, chunkDurationMs);
}

function createRecorder() {
  currentChunks = [];
  currentChunkStartEpoch = Date.now();
  const mimeType = chooseMimeType();
  activeMimeType = mimeType || 'audio/webm';
  mediaRecorder = mimeType ? new MediaRecorder(captureStream, { mimeType }) : new MediaRecorder(captureStream);

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      currentChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener('error', async (event) => {
    await sendMessage({
      type: 'OFFSCREEN_ERROR',
      message: event.error?.message || 'MediaRecorder encountered an error.'
    }).catch(() => {});
    await cleanup();
  });

  mediaRecorder.addEventListener('stop', async () => {
    const blob = new Blob(currentChunks, { type: activeMimeType });
    const startTime = Math.max(0, Math.floor((currentChunkStartEpoch - sessionStartEpoch) / 1000));
    const currentIndex = chunkIndex;
    currentChunks = [];

    if (!cancelRequested && blob.size > 0) {
      const base64 = await blobToBase64(blob);
      await sendMessage({
        type: 'OFFSCREEN_CHUNK_READY',
        blob: base64,
        chunkIndex: currentIndex,
        startTime
      });
    }

    if (cancelRequested) {
      await cleanup();
      return;
    }

    if (stopRequested) {
      await sendMessage({ type: 'OFFSCREEN_DONE' });
      await cleanup();
      return;
    }

    chunkIndex += 1;
    createRecorder();
    mediaRecorder.start();
    scheduleRotation();
  });
}

async function startOffscreenCapture(streamId, chunkDuration) {
  if (isStarting || captureStream) {
    throw new Error('A recording session is already active in the offscreen document.');
  }
  isStarting = true;
  try {
    captureStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    audioContext = new AudioContext();
    await audioContext.resume();
    sourceNode = audioContext.createMediaStreamSource(captureStream);
    sourceNode.connect(audioContext.destination);

    chunkDurationMs = Math.max(1000, Number(chunkDuration || 180) * 1000);
    sessionStartEpoch = Date.now();
    chunkIndex = 0;
    stopRequested = false;
    cancelRequested = false;

    createRecorder();
    mediaRecorder.start();
    scheduleRotation();
  } finally {
    isStarting = false;
  }
}

async function stopOffscreenCapture() {
  stopRequested = true;
  clearRotationTimer();
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  await sendMessage({ type: 'OFFSCREEN_DONE' });
  await cleanup();
}

async function cancelOffscreenCapture() {
  cancelRequested = true;
  clearRotationTimer();
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  await cleanup();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'OFFSCREEN_START':
        await startOffscreenCapture(message.streamId, message.chunkDuration);
        sendResponse({ ok: true });
        return;
      case 'OFFSCREEN_STOP':
        await stopOffscreenCapture();
        sendResponse({ ok: true });
        return;
      case 'OFFSCREEN_CANCEL':
        await cancelOffscreenCapture();
        sendResponse({ ok: true });
        return;
      default:
        sendResponse({ ok: false, error: `Unknown offscreen message: ${message?.type || 'undefined'}` });
    }
  })().catch(async (error) => {
    await sendMessage({ type: 'OFFSCREEN_ERROR', message: error.message || String(error) }).catch(() => {});
    await cleanup();
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

void sendMessage({ type: 'OFFSCREEN_READY' }).catch(() => {});
