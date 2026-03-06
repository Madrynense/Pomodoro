let timerId = null
let tickId = null

let startAt = null
let nextAt = null
let intervalMs = 30 * 60 * 1000

let audioCtx = null
let gainNode = null
let decodedBuffer = null
let currentSource = null


const elStart = document.getElementById("start")
const elStop = document.getElementById("stop")
const elTest = document.getElementById("test")
const elStopSound = document.getElementById("stopSound")

const elStatus = document.getElementById("status")
const elNext = document.getElementById("next")
const elCountdown = document.getElementById("countdown")

const elMins = document.getElementById("mins")
const elVol = document.getElementById("vol")
const elVolLabel = document.getElementById("volLabel")

const elFile = document.getElementById("file")
const elFileLabel = document.getElementById("fileLabel")


const progressCircle = document.querySelector("circle.progress")

const R = 52
const CIRC = 2 * Math.PI * R

progressCircle.style.strokeDasharray = CIRC
progressCircle.style.strokeDashoffset = CIRC


function pad2(n){
return String(n).padStart(2,"0")
}


function fmtTime(dt){
return dt.toLocaleTimeString([],{
hour:'2-digit',
minute:'2-digit',
second:'2-digit'
})
}


function fmtRemaining(ms){

const total = Math.max(0, Math.ceil(ms/1000))

const m = Math.floor(total/60)

const s = total % 60

return `${pad2(m)}:${pad2(s)}`

}


function setRunning(r){

elStart.disabled = r
elStop.disabled = !r

elStatus.textContent = r ? "corriendo" : "detenida"

}


async function ensureAudioUnlocked(){

if(!audioCtx){

audioCtx = new (window.AudioContext || window.webkitAudioContext)()

gainNode = audioCtx.createGain()

gainNode.connect(audioCtx.destination)

}

if(audioCtx.state === "suspended")
await audioCtx.resume()

gainNode.gain.value = Number(elVol.value)

}


async function decodeSelectedFile(file){

if(!file){
decodedBuffer = null
return
}

await ensureAudioUnlocked()

const buf = await file.arrayBuffer()

try{

decodedBuffer = await audioCtx.decodeAudioData(buf.slice(0))

}catch{

decodedBuffer = null

}

}


async function beepFallback(){

await ensureAudioUnlocked()

const osc = audioCtx.createOscillator()
const g = audioCtx.createGain()

osc.type = "sine"

osc.frequency.value = 880

g.gain.value = 0.12

osc.connect(g)

g.connect(gainNode)

osc.start()

setTimeout(()=>{

try{
osc.stop()
}catch{}

},700)

}


function stopSound(){

if(currentSource){

try{
currentSource.stop()
}catch{}

currentSource = null

}

}


async function playSound(){

await ensureAudioUnlocked()

gainNode.gain.value = Number(elVol.value)

stopSound()

if(decodedBuffer){

const src = audioCtx.createBufferSource()

src.buffer = decodedBuffer

src.connect(gainNode)

src.start()

currentSource = src

}else{

await beepFallback()

}

}


function recalcInterval(){

const mins = Math.max(1, parseInt(elMins.value || "30"))

intervalMs = mins * 60 * 1000

}


function updateUI(){

if(!nextAt){

elCountdown.textContent = "--:--"

elNext.textContent = "—"

progressCircle.style.strokeDashoffset = CIRC

return

}

const now = Date.now()

const remaining = nextAt - now

elCountdown.textContent = fmtRemaining(remaining)

elNext.textContent = fmtTime(new Date(nextAt))


const elapsed = Math.min(intervalMs, Math.max(0, now - startAt))

const progress = elapsed / intervalMs

const offset = CIRC * (1 - progress)

progressCircle.style.strokeDashoffset = offset

}


function stopAll(){

if(timerId)
clearTimeout(timerId)

if(tickId)
clearInterval(tickId)

timerId = null

tickId = null

startAt = null

nextAt = null

setRunning(false)

updateUI()

}


function scheduleNext(){

startAt = Date.now()

nextAt = startAt + intervalMs

updateUI()


if(tickId)
clearInterval(tickId)

tickId = setInterval(updateUI,200)


if(timerId)
clearTimeout(timerId)

timerId = setTimeout(async ()=>{

await playSound()

stopAll()

}, intervalMs)

setRunning(true)

}


elStart.addEventListener("click", async ()=>{

await ensureAudioUnlocked()

if(elFile.files && elFile.files[0] && !decodedBuffer){

await decodeSelectedFile(elFile.files[0])

}

recalcInterval()

stopAll()

scheduleNext()

})


elStop.addEventListener("click", ()=>{

stopAll()

})


elTest.addEventListener("click", async ()=>{

await ensureAudioUnlocked()

if(elFile.files && elFile.files[0] && !decodedBuffer){

await decodeSelectedFile(elFile.files[0])

}

await playSound()

})


elStopSound.addEventListener("click", ()=>{

stopSound()

})


elVol.addEventListener("input", ()=>{

elVolLabel.textContent = Number(elVol.value).toFixed(2)

if(gainNode)
gainNode.gain.value = Number(elVol.value)

})


elMins.addEventListener("change", ()=>{

recalcInterval()

if(timerId){

stopAll()

scheduleNext()

}

})


elFile.addEventListener("change", async ()=>{

const f = elFile.files && elFile.files[0]

elFileLabel.textContent = f ? f.name : "Ningún archivo seleccionado"

decodedBuffer = null

if(f)
await decodeSelectedFile(f)

})


setRunning(false)

elVolLabel.textContent = Number(elVol.value).toFixed(2)

updateUI()