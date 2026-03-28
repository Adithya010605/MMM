import { midiToLabel } from "../lib/notes";

type KeyboardProps = {
  onNoteStart: (note: number) => void;
  onNoteEnd: (note: number) => void;
};

const NOTES = Array.from({ length: 24 }, (_, index) => 48 + index);
const BLACK = new Set([1, 3, 6, 8, 10]);

export function Keyboard({ onNoteStart, onNoteEnd }: KeyboardProps) {
  return (
    <div className="keyboard-panel">
      <div className="keyboard">
        {NOTES.map((note) => {
          const isBlack = BLACK.has(note % 12);
          return (
            <button
              key={note}
              type="button"
              className={isBlack ? "key key-black" : "key key-white"}
              aria-label={`Play ${midiToLabel(note)}`}
              onPointerDown={() => onNoteStart(note)}
              onPointerUp={() => onNoteEnd(note)}
              onPointerLeave={() => onNoteEnd(note)}
            >
              <span>{midiToLabel(note)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
