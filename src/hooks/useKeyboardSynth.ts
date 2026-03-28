import { useEffect, useRef, type MutableRefObject } from "react";
import { KEYBOARD_NOTE_MAP } from "../lib/notes";
import { SynthEngine } from "../audio/engine/SynthEngine";

export function useKeyboardSynth(engineRef: MutableRefObject<SynthEngine | null>): void {
  const activeCodesRef = useRef(new Set<string>());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;
      }

      const note = KEYBOARD_NOTE_MAP[event.code];
      if (note === undefined) return;

      activeCodesRef.current.add(event.code);
      void engineRef.current?.noteOn(note);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const note = KEYBOARD_NOTE_MAP[event.code];
      if (note === undefined) return;
      if (!activeCodesRef.current.has(event.code)) return;
      activeCodesRef.current.delete(event.code);
      engineRef.current?.noteOff(note);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [engineRef]);
}
