export type PlaybackStatus = "idle" | "playing" | "failed" | "ended";

export type PlaybackState = {
  status: PlaybackStatus;
  currentId: string | null;
  failures: number;
};

export type PlaybackEvent =
  | { type: "start"; id: string }
  | { type: "ended" }
  | { type: "failed" }
  | { type: "skip"; nextId: string | null }
  | { type: "reset" };

export function reducePlayback(
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackState {
  switch (event.type) {
    case "start":
      return {
        status: "playing",
        currentId: event.id,
        failures: 0,
      };
    case "ended":
      return {
        status: "ended",
        currentId: null,
        failures: state.failures,
      };
    case "failed":
      return {
        status: "failed",
        currentId: null,
        failures: state.failures + 1,
      };
    case "skip":
      if (event.nextId === null) {
        return {
          status: "idle",
          currentId: null,
          failures: 0,
        };
      }
      return {
        status: "playing",
        currentId: event.nextId,
        failures: 0,
      };
    case "reset":
      return {
        status: "idle",
        currentId: null,
        failures: 0,
      };
    default:
      return state;
  }
}
