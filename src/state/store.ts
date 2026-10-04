import { create } from "zustand";
import { apScenario } from "../domain/scenario-ap";
import type { ActionType, BridgeMode, BridgeStatus, LookupKey, TranscriptLine, WorkMap } from "../domain/types";
import { envAgentIds } from "../config";
import { seedWorkMap } from "../engine/seed";
import type { Progress } from "../engine/tutor";
import { emptyWorkMap } from "../engine/workmap";

export type Screen = "landing" | "capture" | "map" | "tutor";
export type VoiceMode = "elevenlabs" | "simulated";

export interface Settings {
  apprenticeAgentId: string;
  tutorAgentId: string;
  traineeName: string;
}

interface Persisted {
  settings: Settings;
  workMap: WorkMap | null;
}

const KEY = "apprentice.v1";

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* storage unavailable */
  }
  return { settings: { apprenticeAgentId: "", tutorAgentId: "", traineeName: "Sam" }, workMap: null };
}

const persisted = load();

/** Live voice is the default whenever both agents are configured; ?sim=1 forces the offline mode. */
function defaultVoiceMode(): VoiceMode {
  const forceSim = typeof location !== "undefined" && new URLSearchParams(location.search).has("sim");
  const ids = {
    a: persisted.settings.apprenticeAgentId || envAgentIds.apprentice,
    t: persisted.settings.tutorAgentId || envAgentIds.tutor,
  };
  return !forceSim && ids.a && ids.t ? "elevenlabs" : "simulated";
}

export interface AppState {
  screen: Screen;
  voiceMode: VoiceMode;
  settings: Settings;

  workMap: WorkMap;
  mapSource: "captured" | "seed" | "empty";
  newInsightIds: string[];
  focus: { stepId?: string; insightId?: string };

  bridgeStatus: BridgeStatus;
  bridgeDetail?: string;
  bridgeMode: BridgeMode;
  muted: boolean;
  transcript: TranscriptLine[];

  // capture
  caseIndex: number;
  decisions: Record<string, ActionType>;
  openedLookups: Record<string, LookupKey[]>;
  activeLookup: LookupKey | null;
  asked: string[];
  silent: string[];
  wrap: "none" | "queued" | "running" | "done";

  // tutor
  tutorIndex: number;
  progress: Progress;
  tutorPhase: "intro" | "practice" | "done";
  tutorWrap: "none" | "running" | "done";
}

const initialMap = (): { map: WorkMap; source: AppState["mapSource"] } =>
  persisted.workMap && persisted.workMap.insights.length > 0
    ? { map: persisted.workMap, source: "captured" }
    : { map: emptyWorkMap(apScenario), source: "empty" };

export const useApp = create<AppState>(() => ({
  screen: "landing",
  voiceMode: defaultVoiceMode(),
  settings: {
    apprenticeAgentId: persisted.settings.apprenticeAgentId || envAgentIds.apprentice,
    tutorAgentId: persisted.settings.tutorAgentId || envAgentIds.tutor,
    traineeName: persisted.settings.traineeName || "Sam",
  },

  workMap: initialMap().map,
  mapSource: initialMap().source,
  newInsightIds: [],
  focus: {},

  bridgeStatus: "idle",
  bridgeMode: "listening",
  muted: false,
  transcript: [],

  caseIndex: 0,
  decisions: {},
  openedLookups: {},
  activeLookup: null,
  asked: [],
  silent: [],
  wrap: "none",

  tutorIndex: -1,
  progress: {},
  tutorPhase: "intro",
  tutorWrap: "none",
}));

export const set = useApp.setState;
export const get = useApp.getState;

useApp.subscribe((s) => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ settings: s.settings, workMap: s.mapSource === "captured" ? s.workMap : null } satisfies Persisted),
    );
  } catch {
    /* ignore */
  }
});

let lineSeq = 0;
export function addTranscript(line: Omit<TranscriptLine, "id" | "t">) {
  set((s) => ({ transcript: [...s.transcript, { ...line, id: `t${++lineSeq}`, t: Date.now() }].slice(-200) }));
}

export function loadSeedMap() {
  set({ workMap: seedWorkMap(apScenario), mapSource: "seed", newInsightIds: [], focus: {} });
}

export function resetCaptureState() {
  set({
    workMap: emptyWorkMap(apScenario),
    mapSource: "empty",
    newInsightIds: [],
    focus: {},
    transcript: [],
    caseIndex: 0,
    decisions: {},
    openedLookups: {},
    activeLookup: null,
    asked: [],
    silent: [],
    wrap: "none",
    bridgeStatus: "idle",
    bridgeDetail: undefined,
    bridgeMode: "listening",
  });
}

export function resetTutorState() {
  set({
    transcript: [],
    tutorIndex: -1,
    progress: {},
    tutorPhase: "intro",
    tutorWrap: "none",
    activeLookup: null,
    openedLookups: {},
    decisions: {},
    focus: {},
    bridgeStatus: "idle",
    bridgeDetail: undefined,
    bridgeMode: "listening",
  });
}
