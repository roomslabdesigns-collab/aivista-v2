import { EventEmitter } from "node:events";
import type { AnalysisEvent } from "../shared/types.js";

const bus = new EventEmitter();
bus.setMaxListeners(100);

export const emit = (analysisId: string, event: AnalysisEvent) => bus.emit(analysisId, event);

export function subscribe(analysisId: string, fn: (e: AnalysisEvent) => void) {
  bus.on(analysisId, fn);
  return () => bus.off(analysisId, fn);
}
