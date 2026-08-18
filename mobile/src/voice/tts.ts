import * as Speech from "expo-speech";

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

/** Picks the TTS voice locale from the text's own script, so a Hindi reply is actually spoken in
 * Hindi rather than read with an English voice — no separate language setting to keep in sync. */
function languageFor(text: string): string {
  return DEVANAGARI_RANGE.test(text) ? "hi-IN" : "en-US";
}

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text, { language: languageFor(text), pitch: 1, rate: 1 });
}

export function stopSpeaking(): void {
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
