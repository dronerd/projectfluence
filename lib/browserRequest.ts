/** Cancelable deadlines for browsers without AbortSignal.any/timeout (older Safari). */
export function requestSignal(timeoutMs = 15_000, signals: readonly AbortSignal[] = []) {
  const controller = new AbortController();
  const listeners: Array<{ signal: AbortSignal; abort: () => void }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    for (const { signal, abort } of listeners) signal.removeEventListener("abort", abort);
    listeners.length = 0;
  };
  const abort = (reason: unknown) => { dispose(); controller.abort(reason); };
  for (const signal of signals) {
    if (signal.aborted) { abort(signal.reason); break; }
    const listener = () => abort(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push({ signal, abort: listener });
  }
  if (!controller.signal.aborted) {
    timer = setTimeout(() => abort(new DOMException("The request timed out.", "TimeoutError")), timeoutMs);
  }
  return { signal: controller.signal, dispose };
}
