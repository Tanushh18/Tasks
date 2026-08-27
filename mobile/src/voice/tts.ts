import * as Speech from "expo-speech";

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

/** Picks the TTS voice locale from the text's own script, so a Hindi reply is actually spoken in
 * Hindi rather than read with an English voice — no separate language setting to keep in sync. */
function languageFor(text: string): string {
  return DEVANAGARI_RANGE.test(text) ? "hi-IN" : "en-US";
}

/**
 * Identifies the utterance currently owning the speaker. Every `speak` call takes ownership; when
 * a callback fires it only clears the flag if it still owns it, so a late `onDone` from an
 * interrupted utterance can't mark a newer one as finished.
 */
let currentUtteranceId = 0;
let speaking = false;
let listeners: Array<(value: boolean) => void> = [];

function setSpeaking(next: boolean): void {
  if (speaking === next) return;
  speaking = next;
  for (const listener of listeners) listener(next);
}

/** Subscribe to speaking/not-speaking so a screen can show or hide a Stop control. */
export function onSpeakingChange(listener: (value: boolean) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

export function isSpeakingNow(): boolean {
  return speaking;
}

/**
 * Speaks a reply, replacing anything already playing.
 *
 * Only one response is ever audible: a new reply stops the previous one rather than queueing
 * behind it, so a user who asks a second question doesn't sit through the first answer (spec §28).
 * Empty text is ignored so the speaker is never taken for nothing.
 */
export function speak(text: string): void {
  const trimmed = text?.trim();
  if (!trimmed) return;

  Speech.stop();
  const id = ++currentUtteranceId;
  setSpeaking(true);

  const release = () => {
    // Ignore callbacks from an utterance that has already been superseded.
    if (id === currentUtteranceId) setSpeaking(false);
  };

  try {
    Speech.speak(trimmed, {
      language: languageFor(trimmed),
      pitch: 1,
      rate: 1,
      onDone: release,
      onStopped: release,
      onError: release,
    });
  } catch {
    // No audio route (silent mode, a disconnected Bluetooth device) must not break the reply —
    // the text is on screen regardless.
    release();
  }
}

export function stopSpeaking(): void {
  // Bump the id so any in-flight callback is treated as stale.
  currentUtteranceId += 1;
  setSpeaking(false);
  try {
    Speech.stop();
  } catch {
    // Nothing playing.
  }
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
