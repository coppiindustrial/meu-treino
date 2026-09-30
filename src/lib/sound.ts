// Apitos do descanso e dos tiros. O iPhone só libera o som depois de um toque: chame
// unlockAudio() dentro de um toque (ao marcar série, iniciar tiros...).

let audioCtx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    // sem áudio
  }
}

/** Toca `count` apitos curtos seguidos. */
export function beep(count = 3): void {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < count; i++) {
      const offset = i * 0.25;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.2);
    }
  } catch {
    // sem áudio
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // sem vibração
  }
}
