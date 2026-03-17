let timerId = null;
let tickId = null;

let startAt = null;
let nextAt = null;
let intervalMs = 0;
let currentMode = null;

let cycleCount = 0;

// UI
const elStart = document.getElementById("start");
const elStop = document.getElementById("stop");
const elTestStudy = document.getElementById("testStudy");
const elTestBreak = document.getElementById("testBreak");
const elStopSound = document.getElementById("stopSound");

const elCountdown = document.getElementById("countdown");
const elMode = document.getElementById("mode");
const elStatus = document.getElementById("status");
const elNext = document.getElementById("next");
const elCycles = document.getElementById("cycles");

const elStudyMins = document.getElementById("studyMins");
const elBreakMins = document.getElementById("breakMins");
const elVol = document.getElementById("vol");
const elVolLabel = document.getElementById("volLabel");

const elStudyFile = document.getElementById("studyFile");
const elBreakFile = document.getElementById("breakFile");
const elStudyFileLabel = document.getElementById("studyFileLabel");
const elBreakFileLabel = document.getElementById("breakFileLabel");

// Audio
let audioCtx = null;
let gainNode = null;
let studyBuffer = null;
let breakBuffer = null;
let currentSource = null;

// Tab blink
let tabBlinkInterval = null;
let tabBlinkTimeout = null;
const originalTitle = document.title;

// SVG
const progressCircle = document.querySelector(".progress");
const R = 52;
const CIRC = 2 * Math.PI * R;
progressCircle.style.strokeDasharray = CIRC;
progressCircle.style.strokeDashoffset = CIRC;

function pad(n){ return String(n).padStart(2,"0"); }

function fmtRemaining(ms){
const t = Math.max(0, Math.ceil(ms/1000));
return `${pad(Math.floor(t/60))}:${pad(t%60)}`;
}

function setRunning(r){
elStart.disabled = r;
elStop.disabled = !r;
elStatus.textContent = r ? "corriendo" : "detenida";
}

function stopTabBlink(){
clearInterval(tabBlinkInterval);
clearTimeout(tabBlinkTimeout);
document.title = originalTitle;
}

function startTabBlink(color){
stopTabBlink();
let icon = color === "red" ? "🔴" : "🔵";
let visible = false;

tabBlinkInterval = setInterval(()=>{
document.title = visible ? `${icon} Pomodoro` : originalTitle;
visible = !visible;
},600);

tabBlinkTimeout = setTimeout(stopTabBlink,10000);
}

async function ensureAudio(){
if(!audioCtx){
audioCtx = new AudioContext();
gainNode = audioCtx.createGain();
gainNode.connect(audioCtx.destination);
}
if(audioCtx.state==="suspended") await audioCtx.resume();
gainNode.gain.value = Number(elVol.value);
}

async function decodeFile(file){
if(!file) return null;
await ensureAudio();
const buf = await file.arrayBuffer();
return audioCtx.decodeAudioData(buf);
}

function stopSound(){
if(currentSource){
try{currentSource.stop();}catch{}
currentSource = null;
}
}

async function playBuffer(buffer,freq){
await ensureAudio();
stopSound();

if(buffer){
const src = audioCtx.createBufferSource();
src.buffer = buffer;
src.connect(gainNode);
src.start();
currentSource = src;
}else{
const osc = audioCtx.createOscillator();
osc.frequency.value = freq;
osc.connect(gainNode);
osc.start();
setTimeout(()=>osc.stop(),600);
}
}

function updateUI(){

if(!nextAt){
elCountdown.textContent="--:--";
progressCircle.style.strokeDashoffset=CIRC;
return;
}

const now = Date.now();
elCountdown.textContent = fmtRemaining(nextAt-now);

const elapsed = Math.min(intervalMs, now-startAt);
progressCircle.style.strokeDashoffset = CIRC*(1-elapsed/intervalMs);
}

function stopAll(){

clearTimeout(timerId);
clearInterval(tickId);

stopSound();
stopTabBlink();

// 🔴 reset completo
currentMode = null;
startAt = null;
nextAt = null;

cycleCount = 0;
elCycles.textContent="0";

setRunning(false);
updateUI();
}

function scheduleMode(mode){

currentMode = mode;
intervalMs = (mode==="study"?elStudyMins.value:elBreakMins.value)*60000;

startAt = Date.now();
nextAt = startAt + intervalMs;

// 🎯 texto modo
elMode.textContent = mode==="study"?"estudio":"descanso";

// 🎨 color del círculo
if(mode === "study"){
progressCircle.style.stroke = "#22c55e"; // verde
}else{
progressCircle.style.stroke = "#3b82f6"; // azul
}

setRunning(true);

clearInterval(tickId);
tickId = setInterval(updateUI,200);

timerId = setTimeout(async()=>{

if(mode==="study"){
await playBuffer(studyBuffer,880);
startTabBlink("red");
}else{
await playBuffer(breakBuffer,660);
startTabBlink("blue");

// ✅ ciclo completo
cycleCount++;
elCycles.textContent = cycleCount;
}

scheduleMode(mode==="study"?"break":"study");

}, intervalMs);
}

// EVENTOS

elStart.onclick = async ()=>{

await ensureAudio();

if(elStudyFile.files[0] && !studyBuffer)
studyBuffer = await decodeFile(elStudyFile.files[0]);

if(elBreakFile.files[0] && !breakBuffer)
breakBuffer = await decodeFile(elBreakFile.files[0]);

stopAll();
scheduleMode("study");
};

elStop.onclick = stopAll;

elStopSound.onclick = stopSound;

elTestStudy.onclick = ()=>playBuffer(studyBuffer,880);

elTestBreak.onclick = ()=>playBuffer(breakBuffer,660);

elStudyFile.onchange = async ()=>{
studyBuffer = await decodeFile(elStudyFile.files[0]);
elStudyFileLabel.textContent = elStudyFile.files[0]?.name || "";
};

elBreakFile.onchange = async ()=>{
breakBuffer = await decodeFile(elBreakFile.files[0]);
elBreakFileLabel.textContent = elBreakFile.files[0]?.name || "";
};

elVol.oninput = ()=>{
elVolLabel.textContent = Number(elVol.value).toFixed(2);
};

// INIT

progressCircle.style.stroke = "#22c55e"; // color inicial (verde)

updateUI();