/** Undo / redo stack of immutable snapshots. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(public current: T, private limit = 100) {}
  push(next: T) {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
  }
  /** Replace the current value without creating an undo step (e.g. while typing a name). */
  replace(next: T) { this.current = next; }
  reset(next: T) { this.past = []; this.future = []; this.current = next; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo(): T | null {
    const p = this.past.pop();
    if (p === undefined) return null;
    this.future.push(this.current);
    this.current = p;
    return p;
  }
  redo(): T | null {
    const n = this.future.pop();
    if (n === undefined) return null;
    this.past.push(this.current);
    this.current = n;
    return n;
  }
}
