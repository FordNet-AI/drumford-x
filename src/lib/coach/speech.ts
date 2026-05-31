/**
 * Thin wrapper around the browser Web Speech API (speechSynthesis) for Coach
 * Mode voice cues.
 *
 * Design notes:
 * - **Cancel-before-speak.** Every speak() cancels any in-flight/queued
 *   utterance first, so cues never pile up or overlap — a later cue always
 *   replaces an earlier one. Coach cues are time-sensitive; a stale "tempo up"
 *   should never play on top of the next instruction.
 * - **Graceful when unsupported.** speechSupported() lets callers skip the UI;
 *   speak()/cancelSpeech() are no-ops if speechSynthesis is missing (e.g. a
 *   stripped Electron build, or SSR) so callers don't need to guard.
 * - **Voices load async.** getVoices() is frequently empty on the very first
 *   call and only populates after the `voiceschanged` event. We cache the
 *   chosen voice once available and otherwise fall back to the platform
 *   default (omit `utterance.voice`), which still speaks fine.
 *
 * No external dependencies.
 */

/** Playback rate for cues — a touch quicker than default so they stay short. */
const CUE_RATE = 1.05

/**
 * Cached preferred voice. `undefined` = not yet resolved (voices may not have
 * loaded); `null` = resolved but no English voice found (use platform default).
 */
let preferredVoice: SpeechSynthesisVoice | null | undefined = undefined

/** True if the browser exposes the Web Speech synthesis API. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

/**
 * Resolve (and cache) a sensible default voice: the first English voice if the
 * list is populated. Returns `undefined` while voices are still loading so the
 * caller leaves `utterance.voice` unset (platform default). Once voices load,
 * caches `null` if no English voice exists so we stop re-scanning.
 */
function getPreferredVoice(): SpeechSynthesisVoice | undefined {
  if (preferredVoice !== undefined) return preferredVoice ?? undefined
  if (!speechSupported()) return undefined

  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) {
    // Voices not loaded yet — don't cache; try again on the next call. Register
    // a one-shot listener to warm the cache as soon as they arrive.
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => {
        // Force a re-resolve on the next speak() by clearing the cache.
        preferredVoice = undefined
      },
      { once: true },
    )
    return undefined
  }

  const english =
    voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? null
  preferredVoice = english
  return english ?? undefined
}

/** Cancel any in-flight or queued speech. No-op if unsupported. */
export function cancelSpeech(): void {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
}

/**
 * Speak `text`, cancelling any current/queued utterance first so cues never
 * overlap. No-op (silently) if the browser has no speech synthesis or the text
 * is empty.
 */
export function speak(text: string): void {
  if (!speechSupported()) return
  const trimmed = text?.trim()
  if (!trimmed) return

  // Replace anything already speaking/queued.
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.rate = CUE_RATE
  const voice = getPreferredVoice()
  if (voice) utterance.voice = voice

  window.speechSynthesis.speak(utterance)
}
