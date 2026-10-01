// src/hooks/useSpeech.js
// Spoken replies for StoreSense: the state and lifecycle around
// src/lib/speech.js.
//
// Output only. This hook never opens a microphone and never asks for a
// permission, so turning spoken replies on cannot fail or prompt the user.
//
// Usage:
//   const voice = useSpeechOutput(user?.id);
//   if (voice.enabled) voice.speakMessage(message.id, message.text);
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelSpeech,
  isSpeechOutputSupported,
  readStoredVoicePref,
  speak,
  writeStoredVoicePref,
} from '../lib/speech';

// Desktop Chrome silently stops an utterance after roughly 15 seconds
// unless the queue is nudged. A ~90-word answer is longer than that, so a
// pause/resume heartbeat keeps it alive. Mobile engines implement pause()
// poorly (it can end playback outright), so the heartbeat stays off there.
const KEEPALIVE_MS = 10000;

function needsKeepalive() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return false;
  return /Chrome|Chromium|Edg/i.test(ua);
}

export function useSpeechOutput(userId) {
  const supported = isSpeechOutputSupported();

  const [enabled, setEnabled] = useState(false);
  // Which message is being read right now, so the UI can show a stop
  // button on that bubble instead of a replay button.
  const [speakingId, setSpeakingId] = useState(null);

  const keepaliveRef = useRef(null);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const clearKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  // Restore the per-account choice once we know who is signed in.
  useEffect(() => {
    if (!supported || !userId) {
      setEnabled(false);
      return;
    }
    setEnabled(readStoredVoicePref(userId));
  }, [supported, userId]);

  // The voice list is populated asynchronously on most engines; touching
  // it early means the first answer already has the right voice.
  useEffect(() => {
    if (!supported) return undefined;
    const warm = () => window.speechSynthesis.getVoices?.();
    warm();
    window.speechSynthesis.addEventListener?.('voiceschanged', warm);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', warm);
  }, [supported]);

  const stop = useCallback(() => {
    clearKeepalive();
    cancelSpeech();
    setSpeakingId(null);
  }, [clearKeepalive]);

  // Speech outlives the page in Chrome: without this, navigating away or
  // closing the tab leaves the answer still being read aloud.
  useEffect(() => {
    if (!supported) return undefined;
    const handlePageHide = () => {
      clearKeepalive();
      cancelSpeech();
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      handlePageHide();
    };
  }, [supported, clearKeepalive]);

  /**
   * Read one message aloud and remember which one it is.
   * Speaking a new message replaces whatever was already being said.
   */
  const speakMessage = useCallback(
    (id, text) => {
      if (!supported) return;
      clearKeepalive();

      const finish = () => {
        clearKeepalive();
        setSpeakingId((current) => (current === id ? null : current));
      };

      const started = speak(text, { onEnd: finish, onError: finish });
      if (!started) {
        setSpeakingId(null);
        return;
      }
      setSpeakingId(id);

      if (needsKeepalive()) {
        keepaliveRef.current = setInterval(() => {
          const synth = window.speechSynthesis;
          if (!synth?.speaking) {
            clearKeepalive();
            return;
          }
          synth.pause();
          synth.resume();
        }, KEEPALIVE_MS);
      }
    },
    [supported, clearKeepalive]
  );

  /** Speak only when the user has spoken replies switched on. */
  const speakIfEnabled = useCallback(
    (id, text) => {
      if (!enabledRef.current) return;
      speakMessage(id, text);
    },
    [speakMessage]
  );

  /**
   * Flip spoken replies on or off.
   *
   * Turning them ON speaks a short confirmation. That is not decoration:
   * iOS Safari only unlocks speech synthesis inside a user gesture, so the
   * confirmation is what makes the *next* answer audible. Turning them off
   * stops anything in progress immediately.
   */
  const toggle = useCallback(() => {
    if (!supported) return;
    setEnabled((current) => {
      const next = !current;
      writeStoredVoicePref(userId, next);
      if (next) {
        speakMessage('voice-on', 'Spoken replies are on.');
      } else {
        clearKeepalive();
        cancelSpeech();
        setSpeakingId(null);
      }
      return next;
    });
  }, [supported, userId, speakMessage, clearKeepalive]);

  return { supported, enabled, speakingId, speakMessage, speakIfEnabled, stop, toggle };
}
