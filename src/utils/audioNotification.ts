/**
 * Audio Notification Engine for Trade Executions
 * Uses Web Audio API for zero-latency, cross-platform synthesized sound alerts.
 * No external MP3 files needed, ensuring 100% reliability in all environments.
 */

export type SoundStyle = 'harmonic' | 'cash' | 'cyber' | 'crystal';

export interface AudioSettings {
  soundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  soundStyle: SoundStyle;
  voiceAnnounce: boolean;
}

const STORAGE_KEY = 'crypto_bot_audio_settings';

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  soundEnabled: true,
  volume: 0.8,
  soundStyle: 'harmonic',
  voiceAnnounce: false,
};

let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

/**
 * Initializes and unlocks the AudioContext on the first user interaction.
 * Web browsers block autoplay audio until a user gesture occurs.
 */
export function initAudioUnlock() {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            isAudioUnlocked = true;
          }).catch(() => {});
        } else if (ctx.state === 'running') {
          isAudioUnlocked = true;
        }
      }
    } catch (e) {
      // ignore
    }
  };

  window.addEventListener('click', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function loadAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_AUDIO_SETTINGS;
}

export function saveAudioSettings(settings: Partial<AudioSettings>): AudioSettings {
  const current = loadAudioSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
  }
  return updated;
}

/**
 * Play harmonic chime (Ascending major chord: C5 -> E5 -> G5 -> C6)
 */
function playHarmonicChime(ctx: AudioContext, masterVolume: number, isLong: boolean = true) {
  const now = ctx.currentTime;
  // If LONG trade: ascending uplifting chord; if SHORT: authoritative descending-ascending resolution
  const freqs = isLong
    ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
    : [783.99, 659.25, 523.25, 880.00]; // G5, E5, C5, A5

  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Mix sine and triangle for rich harmonic fullness
    osc.type = idx === freqs.length - 1 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now + idx * 0.08);

    const noteStart = now + idx * 0.08;
    const noteDuration = idx === freqs.length - 1 ? 0.6 : 0.25;

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(masterVolume * 0.35, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteStart + noteDuration);
  });
}

/**
 * Play cash register / bell ping sound
 */
function playCashChime(ctx: AudioContext, masterVolume: number) {
  const now = ctx.currentTime;
  
  // Metallic strike 1
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(987.77, now); // B5
  gain1.gain.setValueAtTime(masterVolume * 0.4, now);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.22);

  // Metallic high chime 2
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1975.53, now + 0.09); // B6
  gain2.gain.setValueAtTime(0.0001, now + 0.09);
  gain2.gain.exponentialRampToValueAtTime(masterVolume * 0.5, now + 0.11);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.09);
  osc2.stop(now + 0.72);
}

/**
 * Play futuristic cyber radar ping
 */
function playCyberPing(ctx: AudioContext, masterVolume: number, isLong: boolean = true) {
  const now = ctx.currentTime;
  const startFreq = isLong ? 880 : 1200;
  const endFreq = isLong ? 1760 : 660;

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.18);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, now);
  filter.frequency.exponentialRampToValueAtTime(600, now + 0.35);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(masterVolume * 0.3, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.46);
}

/**
 * Play crystal bell resonance
 */
function playCrystalBell(ctx: AudioContext, masterVolume: number) {
  const now = ctx.currentTime;
  const partials = [1200, 2400, 3600];
  const decay = 0.8;

  partials.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const amp = (masterVolume * 0.3) / (idx + 1);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + decay);
  });
}

/**
 * Main function to play the trade executed sound.
 * @param direction 'LONG' or 'SHORT'
 * @param overrideSettings Optional override settings
 */
export function playTradeExecutedSound(
  direction: 'LONG' | 'SHORT' = 'LONG',
  overrideSettings?: Partial<AudioSettings>
): boolean {
  try {
    const settings = { ...loadAudioSettings(), ...overrideSettings };
    if (!settings.soundEnabled || settings.volume <= 0) {
      return false;
    }

    const ctx = getAudioContext();
    if (!ctx) return false;

    // Make sure context is running
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const vol = Math.max(0, Math.min(1, settings.volume));
    const isLong = direction === 'LONG';

    switch (settings.soundStyle) {
      case 'cash':
        playCashChime(ctx, vol);
        break;
      case 'cyber':
        playCyberPing(ctx, vol, isLong);
        break;
      case 'crystal':
        playCrystalBell(ctx, vol);
        break;
      case 'harmonic':
      default:
        playHarmonicChime(ctx, vol, isLong);
        break;
    }

    return true;
  } catch (e) {
    console.warn('AudioNotification: failed to synthesize audio sound', e);
    return false;
  }
}

/**
 * Speaks an announcement of the executed trade via speech synthesis (if enabled in settings).
 */
export function speakTradeAnnouncement(symbol: string, direction: 'LONG' | 'SHORT', price?: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const settings = loadAudioSettings();
  if (!settings.voiceAnnounce || !settings.soundEnabled) return;

  try {
    window.speechSynthesis.cancel(); // cancel pending speech
    const cleanSymbol = symbol.replace('USDT', '');
    const priceText = price ? `at ${price}` : '';
    const text = `Order Filled. ${direction} ${cleanSymbol} ${priceText}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = settings.volume;
    utterance.rate = 1.1; // brisk and professional
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    // ignore
  }
}
