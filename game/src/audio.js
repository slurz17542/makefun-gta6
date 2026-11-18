// Sound, all synthesised with WebAudio: no audio files are shipped. Every
// call is guarded, so the game still runs where audio is unavailable (a
// headless screenshot run, a muted tab). The engine hum and the siren are
// continuous voices whose pitch follows the game; the rest are one-shots.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function isMuted() {
    return muted;
  }

  // A short noise burst through a low-pass filter: a gunshot, a crash.
  function noiseBurst(duration, frequency, volume) {
    if (!ensure()) return;
    resume();
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  // A short sine blip that slides from `from` Hz to `to` Hz.
  function blip(from, to, duration, volume) {
    if (!ensure()) return;
    resume();
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  function shoot() {
    noiseBurst(0.12, 2400, 0.5);
  }

  function crash() {
    noiseBurst(0.25, 500, 0.6);
  }

  function explosion() {
    noiseBurst(0.7, 300, 0.9);
    blip(120, 30, 0.6, 0.5);
  }

  function pickup() {
    blip(660, 990, 0.12, 0.35);
  }

  function cash() {
    blip(880, 880, 0.07, 0.3);
    setTimeout(() => blip(1320, 1320, 0.1, 0.3), 80);
  }

  function missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((note, i) => setTimeout(() => blip(note, note, 0.16, 0.35), i * 110));
  }

  function busted() {
    blip(392, 196, 0.5, 0.4);
  }

  // A two-tone car horn: a short low honk, then a second one a beat later.
  function horn() {
    blip(340, 340, 0.2, 0.32);
    setTimeout(() => blip(340, 340, 0.2, 0.32), 110);
  }

  // The menu click: a quick rising tick for confirms and pauses.
  function uiClick() {
    blip(520, 700, 0.07, 0.25);
  }

  function startEngine() {
    if (!ensure()) return;
    resume();
    if (engineOsc) return;
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  function setEngine(speedRatio, on) {
    if (!engineOsc || !engineGain) return;
    engineGain.gain.setTargetAtTime(on ? 0.05 + speedRatio * 0.06 : 0, context.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, context.currentTime, 0.1);
  }

  function stopEngine() {
    if (!engineOsc) return;
    try {
      engineOsc.stop();
    } catch {
      // Already stopped.
    }
    engineOsc = null;
    engineGain = null;
  }

  function startSiren() {
    if (!ensure()) return;
    resume();
    if (sirenOsc) return;
    sirenOsc = context.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenLfo = context.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 1.6;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 180;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = context.createGain();
    sirenGain.gain.value = 0.045;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  function stopSiren() {
    if (!sirenOsc) return;
    try {
      sirenOsc.stop();
      sirenLfo.stop();
    } catch {
      // Already stopped.
    }
    sirenOsc = null;
    sirenGain = null;
    sirenLfo = null;
  }

  // A lazy bassline loop: a root note per bar with a short hat tick. It is
  // deliberately simple so it never distracts from the driving.
  const BASSLINE = [55, 0, 55, 65.4, 0, 55, 49, 58.3];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    resume();
    musicTimer = setInterval(() => {
      if (muted) return;
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (note > 0) blip(note, note, 0.22, 0.16);
    }, 240);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    ensure,
    resume,
    setMuted,
    isMuted,
    shoot,
    crash,
    explosion,
    pickup,
    cash,
    missionDone,
    busted,
    horn,
    uiClick,
    startEngine,
    setEngine,
    stopEngine,
    startSiren,
    stopSiren,
    startMusic,
    stopMusic,
  };
}
