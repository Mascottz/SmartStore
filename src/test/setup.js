// src/test/setup.js
// Shims for browser APIs that jsdom does not implement.

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  // jsdom has no layout engine. The assistant keeps its transcript pinned to
  // the latest message with scrollIntoView, which would otherwise throw.
  Element.prototype.scrollIntoView = () => {};
}

if (typeof window !== 'undefined' && !window.speechSynthesis) {
  // jsdom implements neither half of the Web Speech API. StoreSense reads
  // its answers aloud through speechSynthesis, so the suite needs a stand-in
  // that records what would have been spoken. Tests assert against
  // `window.speechSynthesis.spoken` and call `__resetSpeech()` to clear it.
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.voice = null;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.onend = null;
      this.onerror = null;
    }
  }

  const synthesis = {
    spoken: [],
    speaking: false,
    paused: false,
    getVoices: () => [],
    speak(utterance) {
      this.speaking = true;
      this.spoken.push(utterance);
      // Real engines fire `end` asynchronously once the audio finishes.
      queueMicrotask(() => {
        this.speaking = false;
        utterance.onend?.();
      });
    },
    cancel() {
      this.speaking = false;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  window.speechSynthesis = synthesis;
  window.SpeechSynthesisUtterance = FakeUtterance;
  globalThis.__resetSpeech = () => {
    synthesis.spoken.length = 0;
    synthesis.speaking = false;
    synthesis.paused = false;
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  // react-hot-toast (and friends) ask for the viewport width via matchMedia.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
