/**
 * Procedural sound effects — pure Web Audio API, no external dependencies.
 */

let audioCtx = null;

export function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function createTone(waveType) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = waveType;
  return { ctx, osc, gain, t: ctx.currentTime };
}

export function playSound(fn) {
  try { fn(); } catch { /* audio not available */ }
}

export function playJumpSound() {
  playSound(() => {
    const { osc, gain, t } = createTone('sine');
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}

export function playDeathSound() {
  playSound(() => {
    const { osc, gain, t } = createTone('sawtooth');
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

export function playCollectSound() {
  playSound(() => {
    const notes = [523, 659, 784]; // C5, E5, G5 arpeggio
    notes.forEach((freq, i) => {
      const { osc, gain, t } = createTone('sine');
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.2);
    });
  });
}

export function playCountdownBeep(pitch = 440) {
  playSound(() => {
    const { osc, gain, t } = createTone('square');
    osc.frequency.value = pitch;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}

export function playWinFanfare() {
  playSound(() => {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const { osc, gain, t } = createTone('sine');
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.4);
    });
  });
}

export function playSpellSound() {
  playSound(() => {
    const { ctx, osc, gain, t } = createTone('sawtooth');
    const filter = ctx.createBiquadFilter();
    osc.disconnect();
    osc.connect(filter);
    filter.connect(gain);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function playCrackSound() {
  playSound(() => {
    const { osc, gain, t } = createTone('sawtooth');
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}

export function playBreakSound() {
  playSound(() => {
    const { osc, gain, t } = createTone('square');
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

export function playBounceSound() {
  playSound(() => {
    const notes = [300, 600, 800];
    notes.forEach((freq, i) => {
      const { osc, gain, t } = createTone('sine');
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.15);
    });
  });
}
