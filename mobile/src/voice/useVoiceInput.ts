import { useCallback, useState } from "react";

// expo-speech-recognition calls requireNativeModule() at import time, which throws immediately
// (crashing the whole app) wherever the native module isn't linked — i.e. in Expo Go. Loading it
// through a guarded require() instead lets every other screen keep working in Expo Go; only voice
// input itself degrades to a clear "requires the dev build" message.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let speechModule: any = null;
export const isVoiceInputAvailable = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    speechModule = require("expo-speech-recognition");
    return true;
  } catch {
    return false;
  }
})();

const useSpeechRecognitionEvent: typeof import("expo-speech-recognition").useSpeechRecognitionEvent = isVoiceInputAvailable
  ? speechModule.useSpeechRecognitionEvent
  : () => undefined;

function humanizeError(code: string): string {
  switch (code) {
    case "no-speech":
      return "I didn't catch that — try again.";
    case "not-allowed":
      return "Microphone/speech permission is required for voice commands.";
    case "network":
      return "Network error during voice recognition.";
    default:
      return "Voice recognition failed. Please try again or type instead.";
  }
}

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
  });
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text !== undefined) setTranscript(text);
  });
  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    setError(humanizeError(event.error));
  });

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    setTranscript("");
    if (!isVoiceInputAvailable) {
      setError("Voice input isn't available in Expo Go — it needs the development build (npx expo run:android / run:ios).");
      return false;
    }
    try {
      const permission = await speechModule.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone/speech permission was not granted. Enable it in device settings.");
        return false;
      }
      speechModule.ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: false });
      return true;
    } catch {
      setError("Voice recognition failed to start. Please try again.");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    if (!isVoiceInputAvailable) return;
    try {
      speechModule.ExpoSpeechRecognitionModule.stop();
    } catch {
      // no-op — nothing to stop if it never started
    }
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return { isListening, transcript, error, start, stop, clearTranscript };
}
