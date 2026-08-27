import { useCallback, useEffect, useReducer, useRef } from "react";
import { Linking } from "react-native";
import {
  initialVoiceState,
  isBusy,
  isMicrophoneActive,
  voiceReducer,
  type VoiceState,
} from "./voiceState";

// expo-speech-recognition calls requireNativeModule() at import time, which throws immediately
// (crashing the whole app) wherever the native module isn't linked — i.e. in Expo Go. Loading it
// through a guarded require() instead lets every other screen keep working in Expo Go; only voice
// input itself degrades to a clear "not available on this device" state.
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

const useSpeechRecognitionEvent: typeof import("expo-speech-recognition").useSpeechRecognitionEvent =
  isVoiceInputAvailable ? speechModule.useSpeechRecognitionEvent : () => undefined;

/** Opens the OS settings page so the user can grant microphone access (spec §17). */
export function openDeviceSettings(): void {
  void Linking.openSettings();
}

function messageForRecognitionError(code: string): string {
  switch (code) {
    case "no-speech":
      return "I didn't hear anything. Tap the microphone and try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is off. You can allow it in Settings or type instead.";
    case "network":
      return "I couldn't reach the speech service. Check your connection and try again.";
    case "aborted":
      return "That was cancelled.";
    default:
      return "I couldn't understand that. Please try again or type instead.";
  }
}

export interface VoiceSession {
  state: VoiceState;
  isSupported: boolean;
  /** Begins a session. Ignored if one is already in flight. */
  start: (lang?: string) => Promise<void>;
  /** Stops the microphone and keeps whatever was heard. */
  finish: () => void;
  /** Stops the microphone and discards the transcript. */
  cancel: () => void;
  reset: () => void;
  /** Post-transcript progress, driven by whoever is handling the command. */
  markInterpreting: () => void;
  markNeedsConfirmation: () => void;
  markExecuting: () => void;
  markSucceeded: (outcome: string) => void;
  markFailed: (message: string) => void;
}

export function useVoiceInput(): VoiceSession {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);

  // The reducer guards against stale events by status, but the native module can also emit after
  // unmount; this ref stops us dispatching into a torn-down component.
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const safeDispatch = useCallback((event: Parameters<typeof voiceReducer>[1]) => {
    if (mountedRef.current) dispatch(event);
  }, []);

  const stopRecognition = useCallback(() => {
    if (!isVoiceInputAvailable) return;
    try {
      speechModule.ExpoSpeechRecognitionModule.stop();
    } catch {
      // Nothing to stop if a session never started.
    }
  }, []);

  useSpeechRecognitionEvent("start", () => safeDispatch({ type: "STARTED" }));

  useSpeechRecognitionEvent("end", () => safeDispatch({ type: "SPEECH_ENDED" }));

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text === undefined) return;
    // Interim results keep the on-screen transcript live; only a final result advances the flow.
    safeDispatch(
      event.isFinal ? { type: "FINAL_TRANSCRIPT", text } : { type: "PARTIAL_TRANSCRIPT", text }
    );
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // Cancellation is already represented.
    safeDispatch({ type: "FAILED", message: messageForRecognitionError(event.error) });
  });

  // Releasing the microphone on unmount matters: leaving it held blocks other apps and keeps the
  // recording indicator lit (spec §96/§97).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isMicrophoneActive(statusRef.current)) {
        try {
          speechModule?.ExpoSpeechRecognitionModule?.abort?.();
        } catch {
          // Best effort — the module may already be torn down.
        }
        stopRecognition();
      }
    };
  }, [stopRecognition]);

  const start = useCallback(
    async (lang = "en-US") => {
      if (!isVoiceInputAvailable) {
        safeDispatch({ type: "UNSUPPORTED" });
        return;
      }
      // A second tap while a session is running must not open a competing recogniser.
      if (isBusy(statusRef.current)) return;

      safeDispatch({ type: "REQUEST_PERMISSION" });
      try {
        const permission = await speechModule.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) {
          safeDispatch({ type: "PERMISSION_DENIED" });
          return;
        }
        safeDispatch({ type: "PERMISSION_GRANTED" });
        speechModule.ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
      } catch {
        safeDispatch({ type: "FAILED", message: "I couldn't start listening. Please try again." });
      }
    },
    [safeDispatch]
  );

  const finish = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  const cancel = useCallback(() => {
    stopRecognition();
    safeDispatch({ type: "CANCEL" });
  }, [stopRecognition, safeDispatch]);

  const reset = useCallback(() => safeDispatch({ type: "RESET" }), [safeDispatch]);

  const markInterpreting = useCallback(() => safeDispatch({ type: "INTERPRETING" }), [safeDispatch]);
  const markNeedsConfirmation = useCallback(() => safeDispatch({ type: "NEEDS_CONFIRMATION" }), [safeDispatch]);
  const markExecuting = useCallback(() => safeDispatch({ type: "EXECUTING" }), [safeDispatch]);
  const markSucceeded = useCallback(
    (outcome: string) => safeDispatch({ type: "SUCCEEDED", outcome }),
    [safeDispatch]
  );
  const markFailed = useCallback(
    (message: string) => safeDispatch({ type: "FAILED", message }),
    [safeDispatch]
  );

  return {
    state,
    isSupported: isVoiceInputAvailable,
    start,
    finish,
    cancel,
    reset,
    markInterpreting,
    markNeedsConfirmation,
    markExecuting,
    markSucceeded,
    markFailed,
  };
}
