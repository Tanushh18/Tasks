import * as Speech from "expo-speech";

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text, { language: "en-US", pitch: 1, rate: 1 });
}

export function stopSpeaking(): void {
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
