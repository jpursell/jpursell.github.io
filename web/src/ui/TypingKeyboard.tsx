import { useEffect } from "preact/hooks";
import { activeTrackId, octaveShift, audioReady } from "./state";
import { AudioEngine } from "../audio/engine";

interface Props {
  engine: AudioEngine;
}

export function TypingKeyboard({ engine }: Props) {
  useEffect(() => {
    if (!audioReady.value) return;

    const NOTE_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];
    let heldKeys: string[] = [];
    let currentKey: string | null = null;
    let currentNote: number | null = null;

    const getBaseNote = () => 60 + octaveShift.value * 12;

    const getNoteForKey = (key: string) => {
        const idx = NOTE_KEYS.indexOf(key);
        if (idx < 0) return null;
        return getBaseNote() + idx;
    };

    const stop = () => {
        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
        }
        heldKeys = [];
        currentKey = null;
        currentNote = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (!audioReady.value) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;

        const target = e.target as HTMLElement;
        if (target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName)) return;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;

        const key = e.key.toLowerCase();
        if (key === "z") {
            e.preventDefault();
            octaveShift.value = Math.max(-2, octaveShift.peek() - 1);
            return;
        }
        if (key === "x") {
            e.preventDefault();
            octaveShift.value = Math.min(2, octaveShift.peek() + 1);
            return;
        }

        const note = getNoteForKey(key);
        if (note == null) return;

        e.preventDefault();
        if (heldKeys.includes(key)) return;
        heldKeys.push(key);

        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
        }

        currentKey = key;
        currentNote = note;
        engine.noteOn(note, 0.85, activeTrackId.peek());
    };

    const onKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const note = getNoteForKey(key);
        if (note == null) return;

        e.preventDefault();
        const idx = heldKeys.lastIndexOf(key);
        if (idx >= 0) heldKeys.splice(idx, 1);

        if (currentKey !== key) return;

        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
        }

        const nextKey = heldKeys.length ? heldKeys[heldKeys.length - 1] : null;
        const nextNote = nextKey ? getNoteForKey(nextKey) : null;

        if (nextKey && nextNote != null) {
            currentKey = nextKey;
            currentNote = nextNote;
            engine.noteOn(nextNote, 0.85, activeTrackId.peek());
        } else {
            currentKey = null;
            currentNote = null;
        }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stop);
    
    return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", stop);
        stop();
    };
  }, [audioReady.value, octaveShift.value]);

  return null;
}
