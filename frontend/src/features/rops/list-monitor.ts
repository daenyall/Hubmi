export const ROPS_POLL_INTERVAL = 30_000;

export type ListSnapshot<T> = {
  data: T[] | null;
  pending: boolean;
  error: string | null;
  newIds: string[];
  lastChecked: string | null;
  paused: boolean;
};

export function initialListSnapshot<T>(): ListSnapshot<T> {
  return { data: null, pending: true, error: null, newIds: [], lastChecked: null, paused: false };
}

/** Jeden odczyt naraz; odświeżenie w tle zachowuje ostatnią poprawną listę. */
export function createListMonitor<T extends { id: string }>({
  load, publish, describeError, isVisible = () => true,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  now = () => new Date().toISOString(),
}: {
  load: (signal: AbortSignal) => Promise<T[]>;
  publish: (state: ListSnapshot<T>) => void;
  describeError: (error: unknown) => { message: string; terminal: boolean };
  isVisible?: () => boolean;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  now?: () => string;
}) {
  let state = initialListSnapshot<T>();
  let disposed = false;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit(next: ListSnapshot<T>) { state = next; if (!disposed) publish(state); }
  function clearTimer() { if (timer !== null) cancel(timer); timer = null; }
  function queue() {
    if (disposed || state.paused) return;
    clearTimer();
    timer = schedule(() => {
      timer = null;
      if (isVisible()) void refresh();
      else queue();
    }, ROPS_POLL_INTERVAL);
  }
  async function refresh() {
    if (disposed || request) return;
    clearTimer();
    const controller = new AbortController();
    request = controller;
    emit({ ...state, pending: true, error: null, paused: false });
    try {
      const data = await Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      });
      if (disposed || controller.signal.aborted) return;
      const previousIds = new Set(state.data?.map((row) => row.id));
      const marked = new Set(state.newIds);
      if (state.data !== null) for (const row of data) if (!previousIds.has(row.id)) marked.add(row.id);
      emit({ data, pending: false, error: null, newIds: data.filter((row) => marked.has(row.id)).map((row) => row.id), lastChecked: now(), paused: false });
    } catch (error) {
      if (disposed || controller.signal.aborted) return;
      const { message, terminal } = describeError(error);
      emit({ ...state, data: terminal ? null : state.data, newIds: terminal ? [] : state.newIds, pending: false, error: message, paused: terminal });
    } finally {
      request = null;
      queue();
    }
  }
  return {
    refresh,
    stop() { disposed = true; clearTimer(); request?.abort(); },
  };
}
