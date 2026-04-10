import { useCallback, useEffect, useRef } from 'react';

type SoundType = 'play-card' | 'truco-call' | 'round-win' | 'game-win';

const soundUrls: Record<SoundType, string> = {
  'play-card': '/sounds/card-slide.mp3',
  'truco-call': '/sounds/truco.mp3',
  'round-win': '/sounds/round-win.mp3',
  'game-win': '/sounds/game-win.mp3',
};

export function useGameSound() {
  const audioCache = useRef<Map<SoundType, HTMLAudioElement>>(new Map());

  useEffect(() => {
    // Preload sounds (optional, only if files exist)
    Object.entries(soundUrls).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audioCache.current.set(key as SoundType, audio);
    });
  }, []);

  const play = useCallback((type: SoundType, volume = 0.5) => {
    const audio = audioCache.current.get(type);
    if (audio) {
      audio.volume = volume;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Silently fail if sound cannot play (e.g., autoplay policy)
      });
    } else {
      // Fallback beep using Web Audio API
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = type === 'round-win' ? 880 : 440;
        gain.gain.value = 0.2;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
        oscillator.stop(ctx.currentTime + 0.5);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  return { play };
}
