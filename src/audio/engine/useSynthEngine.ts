import { useEffect, useRef, type MutableRefObject } from "react";
import { SynthEngine } from "./SynthEngine";
import type { SynthPatch } from "../../types/synth";

export function useSynthEngine(patch: SynthPatch): MutableRefObject<SynthEngine | null> {
  const engineRef = useRef<SynthEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new SynthEngine(patch);
  }

  useEffect(() => {
    engineRef.current?.updatePatch(patch);
  }, [patch]);

  return engineRef;
}
