/**
 * Explicit state machine for a voice session.
 *
 * The microphone previously had one boolean (`isListening`) plus an error string, which left real
 * situations unrepresented: permission being asked for, a partial phrase that stopped mid-sentence,
 * a command waiting on confirmation, speech recognition not existing on the device at all. Each of
 * those needs different words on screen and different buttons, so each is a state here.
 *
 * The reducer is deliberately free of native calls so the whole flow can be tested without a
 * device.
 */

export type VoiceStatus =
  | "idle"
  | "requesting_permission"
  | "permission_denied"
  | "starting"
  | "listening"
  | "processing"
  | "interpreting"
  | "confirmation_required"
  | "executing"
  | "success"
  | "error"
  | "cancelled"
  | "unsupported";

export interface VoiceState {
  status: VoiceStatus;
  /** What has been heard so far. Kept across `listening` → `processing` so the user sees it. */
  transcript: string;
  /** True while the transcript is still provisional. */
  partial: boolean;
  /** User-facing message for `permission_denied`, `error` and `unsupported`. */
  message: string | null;
  /** Set on `success` so the screen can show what happened. */
  outcome: string | null;
}

export type VoiceEvent =
  | { type: "UNSUPPORTED" }
  | { type: "REQUEST_PERMISSION" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "PERMISSION_DENIED" }
  | { type: "STARTED" }
  | { type: "PARTIAL_TRANSCRIPT"; text: string }
  | { type: "FINAL_TRANSCRIPT"; text: string }
  | { type: "SPEECH_ENDED" }
  | { type: "INTERPRETING" }
  | { type: "NEEDS_CONFIRMATION" }
  | { type: "EXECUTING" }
  | { type: "SUCCEEDED"; outcome: string }
  | { type: "FAILED"; message: string }
  | { type: "CANCEL" }
  | { type: "RESET" };

export const initialVoiceState: VoiceState = {
  status: "idle",
  transcript: "",
  partial: false,
  message: null,
  outcome: null,
};

/** A phrase this short is almost certainly a cut-off command, not a real instruction. */
const MIN_USEFUL_WORDS = 2;

/** Openings that clearly promise more ("remind me to…") and mean nothing on their own. */
const DANGLING_PHRASE =
  /\b(?:remind me(?: to| about)?|add(?: a)?(?: task| expense)?|create|delete|show|spent|paid|i spent|yaad|dilana|kharch)\s*$/i;

/**
 * True when a transcript stopped before it said anything actionable. Executing on these is how a
 * half-heard sentence turns into an empty task or a transaction with no amount, so the UI asks the
 * user to try again instead.
 */
export function isIncompleteTranscript(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return true;
  if (trimmed.split(/\s+/).length < MIN_USEFUL_WORDS) return true;
  return DANGLING_PHRASE.test(trimmed);
}

/** States where the microphone is live and must be released before starting anything new. */
export function isMicrophoneActive(status: VoiceStatus): boolean {
  return status === "starting" || status === "listening";
}

/** States where work is genuinely in flight, so the mic button should not start a second session. */
export function isBusy(status: VoiceStatus): boolean {
  return (
    status === "requesting_permission" ||
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "interpreting" ||
    status === "executing"
  );
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "UNSUPPORTED":
      return {
        ...initialVoiceState,
        status: "unsupported",
        message: "Voice isn't available on this device.",
      };

    case "REQUEST_PERMISSION":
      return { ...initialVoiceState, status: "requesting_permission" };

    case "PERMISSION_GRANTED":
      return { ...state, status: "starting", message: null };

    case "PERMISSION_DENIED":
      return {
        ...initialVoiceState,
        status: "permission_denied",
        message: "Microphone access is off. You can allow it in Settings or type instead.",
      };

    case "STARTED":
      return { ...state, status: "listening", transcript: "", partial: false, message: null };

    case "PARTIAL_TRANSCRIPT":
      // Late results can arrive after the user cancelled; they must not revive a dead session.
      if (state.status !== "listening") return state;
      return { ...state, transcript: event.text, partial: true };

    case "FINAL_TRANSCRIPT":
      if (state.status !== "listening" && state.status !== "processing") return state;
      return { ...state, status: "processing", transcript: event.text, partial: false };

    case "SPEECH_ENDED": {
      if (!isMicrophoneActive(state.status) && state.status !== "processing") return state;
      if (isIncompleteTranscript(state.transcript)) {
        return {
          ...state,
          status: "error",
          partial: false,
          message: "I didn't hear the full request.",
        };
      }
      return { ...state, status: "processing", partial: false };
    }

    case "INTERPRETING":
      return { ...state, status: "interpreting" };

    case "NEEDS_CONFIRMATION":
      return { ...state, status: "confirmation_required" };

    case "EXECUTING":
      return { ...state, status: "executing" };

    case "SUCCEEDED":
      return { ...state, status: "success", outcome: event.outcome, message: null };

    case "FAILED":
      return { ...state, status: "error", partial: false, message: event.message };

    case "CANCEL":
      return { ...initialVoiceState, status: "cancelled" };

    case "RESET":
      // An unsupported device stays unsupported — resetting would offer a mic that cannot work.
      return state.status === "unsupported" ? state : initialVoiceState;

    default:
      return state;
  }
}

/** The line shown under the microphone for each state. */
export function statusLabel(state: VoiceState): string {
  switch (state.status) {
    case "requesting_permission":
      return "Checking microphone access…";
    case "starting":
      return "Getting ready…";
    case "listening":
      return "I'm listening…";
    case "processing":
      return "Got it…";
    case "interpreting":
      return "Working out what you meant…";
    case "confirmation_required":
      return "Just checking before I save this.";
    case "executing":
      return "Saving…";
    case "success":
      return state.outcome ?? "Done.";
    case "permission_denied":
    case "unsupported":
    case "error":
      return state.message ?? "Something went wrong.";
    case "cancelled":
      return "Cancelled.";
    default:
      return "Tap the microphone and say what you need.";
  }
}
