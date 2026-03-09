let timerId = null;
let tickId = null;

let startAt = null;
let nextAt = null;
let intervalMs = 30 * 60 * 1000;

let currentMode = null; // "study" | "break"

// Audio
let audioCtx = null;
let gainNode = null;
let studyDecodedBuffer = null;
let breakDecodedBuffer = null;
let currentSource = null;

// Parpadeo de pestaña
let tabBlinkInterval = null;
let tabBlinkTimeout = null;
const originalTitle = document.title;

// UI
const elStart = document.getElementById("start");
const elStop = document.getElementById("stop");
const elTestStudy = document.getElementById("testStudy");
const elTestBreak = document.getElementById("testBreak");
const elStopSound = document.getElementById("stopSound");

const elStatus = document.getElementById("status");
const elMode = document.getElementById("mode");
const elNext = document.getElementById("next");
const elCountdown = document.getElementById("countdown");

const elStudyMins = document.getElementById("studyMins");
const elBreakMins = document.getElementById("breakMins");
const elVol = document.getElementById("vol");
const elVolLabel = document.getElementById("volLabel");

const elStudyFile = document.getElementById("studyFile");
const elStudyFileLabel = document.getElementById("studyFileLabel");

const elBreakFile = document.getElementById("breakFile");
const elBreakFileLabel = document.getElementById("breakFileLabel");

// Círculo SVG
const progressCircle = document.querySelector("circle.progress");
const R = 52;
const CIRC = 2 * Math.PI * R;
progressCircle.style.strokeDasharray = `${CIRC}`;
progressCircle.style.strokeDashoffset = `${CIRC}`;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtTime(dt) {
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function fmtRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function setRunning(r) {
  elStart.disabled = r;
  elStop.disabled = !r;
  elStatus.textContent = r ? "corriendo" : "detenida";
}

function setModeLabel() {
  if (currentMode === "study") {
    elMode.textContent = "estudio";
  } else if (currentMode === "break") {
    elMode.textContent = "descanso";
  } else {
    elMode.textContent = "detenido";
  }
}

function minutesToMs(mins) {
  return Math.max(1, mins) * 60 * 1000;
}

function getStudyMs() {
  return minutesToMs(parseInt(elStudyMins.value || "30", 10));
}

function getBreakMs() {
  return minutesToMs(parseInt(elBreakMins.value || "10", 10));
}

function stopTabBlink() {
  if (tabBlinkInterval) {
    clearInterval(tabBlinkInterval);
    tabBlinkInterval = null;
  }

  if (tabBlinkTimeout) {
    clearTimeout(tabBlinkTimeout);
    tabBlinkTimeout = null;
  }

  document.title = originalTitle;
}

function startTabBlink(color) {
  stopTabBlink();

  let alertTitle = originalTitle;

  if (color === "red") {
    alertTitle = "🔴 Pomodoro";
  } else if (color === "blue") {
    alertTitle = "🔵 Pomodoro";
  }

  let visible = false;

  tabBlinkInterval = setInterval(() => {
    document.title = visible ? alertTitle : originalTitle;
    visible = !visible;
  }, 600);

  tabBlinkTimeout = setTimeout(() => {
    stopTabBlink();
  }, 10000);
}

async function ensureAudioUnlocked() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  gainNode.gain.value = Number(elVol.value);
}

async function decodeAudioFile(file) {
  if (!file) return null;

  await ensureAudioUnlocked();
  const buf = await file.arrayBuffer();

  try {
    return await audioCtx.decodeAudioData(buf.slice(0));
  } catch {
    return null;
  }
}

async function beepFallback(freq = 880) {
  await ensureAudioUnlocked();

  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.value = 0.12;

  osc.connect(g);
  g.connect(gainNode);

  osc.start();

  setTimeout(() => {
    try {
      osc.stop();
    } catch {}
  }, 700);
}

function stopSound() {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {}
    currentSource = null;
  }
}

async function playBuffer(buffer, fallbackFreq = 880) {
  await ensureAudioUnlocked();
  gainNode.gain.value = Number(elVol.value);

  stopSound();

  if (buffer) {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(gainNode);
    src.start();
    currentSource = src;
  } else {
    await beepFallback(fallbackFreq);
  }
}

async function playStudySound() {
  await playBuffer(studyDecodedBuffer, 880);
}

async function playBreakSound() {
  await playBuffer(breakDecodedBuffer, 660);
}

function updateUI() {
  if (!nextAt || !startAt) {
    elCountdown.textContent = "--:--";
    elNext.textContent = "—";
    progressCircle.style.strokeDashoffset = `${CIRC}`;
    setModeLabel();
    return;
  }

  const now = Date.now();
  const remaining = nextAt - now;

  elCountdown.textContent = fmtRemaining(remaining);
  elNext.textContent = fmtTime(new Date(nextAt));
  setModeLabel();

  const elapsed = Math.min(intervalMs, Math.max(0, now - startAt));
  const p = elapsed / intervalMs;
  const offset = CIRC * (1 - p);
  progressCircle.style.strokeDashoffset = `${offset}`;
}

function clearTimers() {
  if (timerId) clearTimeout(timerId);
  if (tickId) clearInterval(tickId);
  timerId = null;
  tickId = null;
}

function stopAll() {
  clearTimers();
  stopSound();
  stopTabBlink();
  startAt = null;
  nextAt = null;
  intervalMs = getStudyMs();
  currentMode = null;
  setRunning(false);
  setModeLabel();
  updateUI();
}

function getNextMode(mode) {
  return mode === "study" ? "break" : "study";
}

function getDurationForMode(mode) {
  return mode === "study" ? getStudyMs() : getBreakMs();
}

async function playAlarmForMode(mode) {
  if (mode === "study") {
    await playStudySound();
  } else {
    await playBreakSound();
  }
}

function scheduleMode(mode) {
  currentMode = mode;
  intervalMs = getDurationForMode(mode);
  startAt = Date.now();
  nextAt = startAt + intervalMs;

  updateUI();
  setRunning(true);

  clearTimers();
  tickId = setInterval(updateUI, 200);

  timerId = setTimeout(async () => {
    await playAlarmForMode(mode);

    if (mode === "study") {
      startTabBlink("red");
    } else if (mode === "break") {
      startTabBlink("blue");
    }

    scheduleMode(getNextMode(mode));
  }, intervalMs);
}

elStart.addEventListener("click", async () => {
  stopTabBlink();
  await ensureAudioUnlocked();

  if (elStudyFile.files && elStudyFile.files[0] && !studyDecodedBuffer) {
    studyDecodedBuffer = await decodeAudioFile(elStudyFile.files[0]);
  }

  if (elBreakFile.files && elBreakFile.files[0] && !breakDecodedBuffer) {
    breakDecodedBuffer = await decodeAudioFile(elBreakFile.files[0]);
  }

  stopAll();
  scheduleMode("study");
});

elStop.addEventListener("click", () => {
  stopAll();
});

elTestStudy.addEventListener("click", async () => {
  await ensureAudioUnlocked();

  if (elStudyFile.files && elStudyFile.files[0] && !studyDecodedBuffer) {
    studyDecodedBuffer = await decodeAudioFile(elStudyFile.files[0]);
  }

  await playStudySound();
});

elTestBreak.addEventListener("click", async () => {
  await ensureAudioUnlocked();

  if (elBreakFile.files && elBreakFile.files[0] && !breakDecodedBuffer) {
    breakDecodedBuffer = await decodeAudioFile(elBreakFile.files[0]);
  }

  await playBreakSound();
});

elStopSound.addEventListener("click", () => {
  stopSound();
});

elVol.addEventListener("input", () => {
  elVolLabel.textContent = Number(elVol.value).toFixed(2);
  if (gainNode) {
    gainNode.gain.value = Number(elVol.value);
  }
});

elStudyMins.addEventListener("change", () => {
  if (timerId && currentMode) {
    stopAll();
    scheduleMode("study");
  }
});

elBreakMins.addEventListener("change", () => {
  if (timerId && currentMode) {
    stopAll();
    scheduleMode("study");
  }
});

elStudyFile.addEventListener("change", async () => {
  const f = elStudyFile.files && elStudyFile.files[0];
  elStudyFileLabel.textContent = f ? f.name : "Ningún archivo seleccionado";
  studyDecodedBuffer = null;

  if (f) {
    studyDecodedBuffer = await decodeAudioFile(f);
  }
});

elBreakFile.addEventListener("change", async () => {
  const f = elBreakFile.files && elBreakFile.files[0];
  elBreakFileLabel.textContent = f ? f.name : "Ningún archivo seleccionado";
  breakDecodedBuffer = null;

  if (f) {
    breakDecodedBuffer = await decodeAudioFile(f);
  }
});

// init
setRunning(false);
setModeLabel();
elVolLabel.textContent = Number(elVol.value).toFixed(2);
updateUI();