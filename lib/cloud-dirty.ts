// Which saved keys changed since they were last sent to the cloud (11 Nov 2026).
//
// Every part of the lister saves through the same browser database; the
// database handle it gets is wrapped so each put() and delete() notes its key.
// The list survives a closed tab (it is kept in localStorage), so a change made
// just before closing is sent the next time the lister opens.

const LS_KEY = "listing-writer:cloud-dirty";
const listeners = new Set<() => void>();
let dirty: Set<string> | null = null;

function load(): Set<string> {
  if (dirty) return dirty;
  try {
    dirty = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]") as string[]);
  } catch {
    dirty = new Set();
  }
  return dirty;
}

function save(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...load()]));
  } catch {
    /* storage blocked: the keys are still sent while the tab stays open */
  }
}

/** Keys the cloud sync never sends: its own bookkeeping. */
export const isLocalOnly = (key: string) => key.startsWith("cloud:");

// How many times each key changed in this tab: a key that changes again
// while it is being sent stays on the list.
const stamps = new Map<string, number>();
export const stampOf = (key: string) => stamps.get(key) ?? 0;

export function markDirty(key: IDBValidKey): void {
  if (typeof key !== "string" || isLocalOnly(key)) return;
  stamps.set(key, stampOf(key) + 1);
  load().add(key);
  save();
  listeners.forEach((l) => l());
}

export function dirtyKeys(): string[] {
  return [...load()];
}

/** Clear keys once sent — only those that did not change again meanwhile. */
export function clearDirty(sent: [key: string, stamp: number][]): void {
  const d = load();
  for (const [k, stamp] of sent) if (stampOf(k) === stamp) d.delete(k);
  save();
}

export function onDirty(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function wrapStore(store: IDBObjectStore): IDBObjectStore {
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "put")
        return (value: unknown, key?: IDBValidKey) => {
          if (key !== undefined) markDirty(key);
          return target.put(value, key);
        };
      if (prop === "delete")
        return (key: IDBValidKey | IDBKeyRange) => {
          if (!(key instanceof IDBKeyRange)) markDirty(key);
          return target.delete(key);
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function wrapTx(tx: IDBTransaction): IDBTransaction {
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === "objectStore") return (name: string) => wrapStore(target.objectStore(name));
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
}

/** The same database, with every write noted for the cloud. */
export function trackWrites(db: IDBDatabase): IDBDatabase {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction")
        return (...args: Parameters<IDBDatabase["transaction"]>) => wrapTx(target.transaction(...args));
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
}
