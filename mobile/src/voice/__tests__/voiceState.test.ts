import {
  initialVoiceState,
  isBusy,
  isIncompleteTranscript,
  isMicrophoneActive,
  statusLabel,
  voiceReducer,
  type VoiceEvent,
  type VoiceState,
} from "../voiceState";

/** Replays a sequence of events from the initial state. */
function run(...events: VoiceEvent[]): VoiceState {
  return events.reduce(voiceReducer, initialVoiceState);
}

describe("voice state machine — happy path", () => {
  it("walks permission → listening → processing", () => {
    const state = run(
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED" },
      { type: "STARTED" },
      { type: "PARTIAL_TRANSCRIPT", text: "remind me to" },
      { type: "FINAL_TRANSCRIPT", text: "remind me to call mom at 5" },
      { type: "SPEECH_ENDED" }
    );

    expect(state.status).toBe("processing");
    expect(state.transcript).toBe("remind me to call mom at 5");
    expect(state.partial).toBe(false);
  });

  it("reaches success through confirmation for a financial command", () => {
    const state = run(
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED" },
      { type: "STARTED" },
      { type: "FINAL_TRANSCRIPT", text: "i spent 500 on groceries" },
      { type: "SPEECH_ENDED" },
      { type: "INTERPRETING" },
      { type: "NEEDS_CONFIRMATION" },
      { type: "EXECUTING" },
      { type: "SUCCEEDED", outcome: "Expense added." }
    );

    expect(state.status).toBe("success");
    expect(statusLabel(state)).toBe("Expense added.");
  });
});

describe("voice state machine — incomplete speech", () => {
  it.each([
    "remind me to",
    "remind me",
    "add",
    "spent",
    "yaad",
    "   ",
    "",
    "hello",
  ])("treats %p as incomplete", (transcript) => {
    expect(isIncompleteTranscript(transcript)).toBe(true);
  });

  it.each([
    "remind me to call mom tomorrow at 5",
    "i spent 500 on groceries",
    "show today's tasks",
  ])("treats %p as complete", (transcript) => {
    expect(isIncompleteTranscript(transcript)).toBe(false);
  });

  it("does not execute a request that stopped halfway", () => {
    const state = run(
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED" },
      { type: "STARTED" },
      { type: "PARTIAL_TRANSCRIPT", text: "remind me to" },
      { type: "SPEECH_ENDED" }
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/didn't hear the full request/i);
  });
});

describe("voice state machine — permission and support", () => {
  it("offers settings guidance when permission is refused", () => {
    const state = run({ type: "REQUEST_PERMISSION" }, { type: "PERMISSION_DENIED" });
    expect(state.status).toBe("permission_denied");
    expect(state.message).toMatch(/settings|type instead/i);
  });

  it("stays unsupported through a reset, so a dead mic is never offered again", () => {
    const state = run({ type: "UNSUPPORTED" }, { type: "RESET" });
    expect(state.status).toBe("unsupported");
    expect(statusLabel(state)).toMatch(/isn't available/i);
  });
});

describe("voice state machine — stale events and cancellation", () => {
  it("ignores a recognition result that arrives after cancelling", () => {
    const cancelled = run(
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED" },
      { type: "STARTED" },
      { type: "CANCEL" }
    );
    expect(cancelled.status).toBe("cancelled");

    const afterLateResult = voiceReducer(cancelled, { type: "PARTIAL_TRANSCRIPT", text: "delete everything" });
    expect(afterLateResult.status).toBe("cancelled");
    expect(afterLateResult.transcript).toBe("");
  });

  it("ignores a final transcript once the session has ended", () => {
    const cancelled = run({ type: "CANCEL" });
    const state = voiceReducer(cancelled, { type: "FINAL_TRANSCRIPT", text: "spent 5000" });
    expect(state.transcript).toBe("");
  });

  it("clears the transcript on cancel so nothing is carried into the next session", () => {
    const state = run(
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED" },
      { type: "STARTED" },
      { type: "FINAL_TRANSCRIPT", text: "i spent 500 on groceries" },
      { type: "CANCEL" }
    );
    expect(state.transcript).toBe("");
  });
});

describe("voice state machine — guards", () => {
  it("knows when the microphone is still held", () => {
    expect(isMicrophoneActive("listening")).toBe(true);
    expect(isMicrophoneActive("starting")).toBe(true);
    expect(isMicrophoneActive("processing")).toBe(false);
    expect(isMicrophoneActive("idle")).toBe(false);
  });

  it("blocks a second session while work is in flight", () => {
    expect(isBusy("listening")).toBe(true);
    expect(isBusy("executing")).toBe(true);
    expect(isBusy("interpreting")).toBe(true);
    expect(isBusy("idle")).toBe(false);
    expect(isBusy("success")).toBe(false);
    expect(isBusy("confirmation_required")).toBe(false);
  });

  it("gives every state something to say", () => {
    const statuses = [
      "idle", "requesting_permission", "permission_denied", "starting", "listening",
      "processing", "interpreting", "confirmation_required", "executing", "success",
      "error", "cancelled", "unsupported",
    ] as const;

    for (const status of statuses) {
      const label = statusLabel({ ...initialVoiceState, status });
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
