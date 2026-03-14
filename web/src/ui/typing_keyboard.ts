type TypingKeyboardOpts = {
  enabled: () => boolean;
  getBaseNote: () => number;
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  octaveDelta: (delta: number) => void;
};

const NOTE_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"] as const;

function shouldIgnoreKeyEvent(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return true;
  if (e.repeat) return true;

  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;

  if (el.isContentEditable) return true;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;

  if (tag === "INPUT") {
    const input = el as HTMLInputElement;
    const t = (input.type || "").toLowerCase();
    // Allow playing while sliders are focused.
    if (t === "range") return false;
    return true;
  }

  return false;
}

export class TypingKeyboard {
  private opts: TypingKeyboardOpts;
  private held: string[] = [];
  private currentKey: string | null = null;
  private currentNote: number | null = null;

  private onKeyDownBound = (e: KeyboardEvent) => this.onKeyDown(e);
  private onKeyUpBound = (e: KeyboardEvent) => this.onKeyUp(e);

  private onBlurBound = () => this.stop();
  private onVisibilityBound = () => {
    if (document.visibilityState === "hidden") this.stop();
  };
  private onFocusInBound = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;

    if (el.isContentEditable) {
      this.stop();
      return;
    }

    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") {
      this.stop();
      return;
    }

    if (tag === "INPUT") {
      const input = el as HTMLInputElement;
      const t = (input.type || "").toLowerCase();
      if (t !== "range") this.stop();
    }
  };

  constructor(opts: TypingKeyboardOpts) {
    this.opts = opts;
    window.addEventListener("keydown", this.onKeyDownBound);
    window.addEventListener("keyup", this.onKeyUpBound);
    window.addEventListener("blur", this.onBlurBound);
    document.addEventListener("visibilitychange", this.onVisibilityBound);
    document.addEventListener("focusin", this.onFocusInBound);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    window.removeEventListener("blur", this.onBlurBound);
    document.removeEventListener("visibilitychange", this.onVisibilityBound);
    document.removeEventListener("focusin", this.onFocusInBound);
    this.stop();
  }

  syncBaseNote(): void {
    if (!this.opts.enabled()) return;
    if (!this.currentKey || this.currentNote == null) return;

    const next = this.noteForKey(this.currentKey);
    if (next == null || next === this.currentNote) return;

    this.opts.noteOff(this.currentNote);
    this.currentNote = next;
    this.opts.noteOn(next, 0.85);
  }

  private stop(): void {
    if (this.currentNote != null) this.opts.noteOff(this.currentNote);
    this.held = [];
    this.currentKey = null;
    this.currentNote = null;
  }

  private noteForKey(key: string): number | null {
    const idx = NOTE_KEYS.indexOf(key as any);
    if (idx < 0) return null;
    return this.opts.getBaseNote() + idx;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.opts.enabled()) return;
    if (shouldIgnoreKeyEvent(e)) return;

    const key = e.key.toLowerCase();

    if (key === "z") {
      e.preventDefault();
      this.opts.octaveDelta(-1);
      return;
    }
    if (key === "x") {
      e.preventDefault();
      this.opts.octaveDelta(1);
      return;
    }

    const note = this.noteForKey(key);
    if (note == null) return;

    e.preventDefault();

    if (this.held.includes(key)) return;
    this.held.push(key);

    if (this.currentNote != null) this.opts.noteOff(this.currentNote);

    this.currentKey = key;
    this.currentNote = note;
    this.opts.noteOn(note, 0.85);
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.opts.enabled()) return;
    if (shouldIgnoreKeyEvent(e)) return;

    const key = e.key.toLowerCase();
    const note = this.noteForKey(key);
    if (note == null) return;

    e.preventDefault();

    const idx = this.held.lastIndexOf(key);
    if (idx >= 0) this.held.splice(idx, 1);

    if (this.currentKey !== key) return;

    if (this.currentNote != null) this.opts.noteOff(this.currentNote);

    const nextKey = this.held.length ? this.held[this.held.length - 1] : null;
    if (!nextKey) {
      this.currentKey = null;
      this.currentNote = null;
      return;
    }

    const nextNote = this.noteForKey(nextKey);
    if (nextNote == null) {
      this.currentKey = null;
      this.currentNote = null;
      return;
    }

    this.currentKey = nextKey;
    this.currentNote = nextNote;
    this.opts.noteOn(nextNote, 0.85);
  }
}

