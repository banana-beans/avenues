/**
 * Web Speech API wrapper. Speaks text through whatever speaker the OS has
 * routed (phone speaker, bluetooth headphones, etc).
 *
 * iOS gotcha: SpeechSynthesis on Safari requires the *first* `speak()` call
 * to occur inside a user gesture. We expose `prime()` to be called from a
 * tap handler — it speaks an empty utterance to "warm" the voice. Subsequent
 * speak() calls (e.g. from a geolocation callback) then work normally.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Speak a queued utterance. No-ops silently if the API isn't available so
 * the rest of the tracker keeps working.
 */
export function speak(text: string): void {
  if (!isSpeechSupported()) return;
  const u = new SpeechSynthesisUtterance(text);
  // Slightly slower than default — runner is moving, mid-effort, and outdoors.
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

/**
 * Warm the iOS Safari voice queue. Must be called from inside a user gesture
 * (e.g. a button click handler). After this returns, future `speak()` calls
 * will produce audio even when invoked from background timers / GPS callbacks.
 */
export function prime(): void {
  if (!isSpeechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/** Cancel any in-flight or queued utterances. Call when ending a run. */
export function cancelAllSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}
