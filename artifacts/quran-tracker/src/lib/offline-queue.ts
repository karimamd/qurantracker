/**
 * Offline mutation queue using IndexedDB (idb-keyval).
 *
 * When the device is offline, failed non-GET API calls are stored here.
 * When the device comes back online, `flushQueue` replays them and the
 * caller invalidates all React Query caches so the UI refreshes.
 *
 * Concurrency safety:
 *   enqueueRequest and flushQueue both funnel through a module-level
 *   Promise chain (`lock`) so they never interleave reads and writes to
 *   the same IDB key. This prevents the lost-update race where two
 *   near-simultaneous enqueues each read the old array and only one
 *   entry survives.
 */
import { get, set, del } from "idb-keyval";

const QUEUE_KEY = "qt_offline_mutation_queue";

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
  timestamp: number;
}

// Serial lock: every IDB operation chains off this promise so reads and
// writes are always sequenced, never concurrent.
let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function enqueueRequest(
  req: Omit<QueuedRequest, "id" | "timestamp">,
): Promise<void> {
  return withLock(async () => {
    const queue = (await get<QueuedRequest[]>(QUEUE_KEY)) ?? [];
    queue.push({ ...req, id: crypto.randomUUID(), timestamp: Date.now() });
    await set(QUEUE_KEY, queue);
  });
}

export function getPendingCount(): Promise<number> {
  return withLock(async () => {
    const queue = (await get<QueuedRequest[]>(QUEUE_KEY)) ?? [];
    return queue.length;
  });
}

/**
 * Replay all queued requests in insertion order.
 *
 * - Network failures (TypeError / device still offline) → keep in queue.
 * - HTTP 4xx/5xx → treat as terminal and discard (the server rejected
 *   the request; re-sending won't help and could cause duplicates).
 * - HTTP 2xx/3xx → success.
 *
 * Returns counts of succeeded and failed replays.
 */
export function flushQueue(): Promise<{ succeeded: number; failed: number }> {
  return withLock(async () => {
    const queue = (await get<QueuedRequest[]>(QUEUE_KEY)) ?? [];
    if (queue.length === 0) return { succeeded: 0, failed: 0 };

    let succeeded = 0;
    let failed = 0;
    const remaining: QueuedRequest[] = [];

    for (const req of queue) {
      try {
        const headers: HeadersInit = {};
        if (req.contentType) headers["content-type"] = req.contentType;
        const res = await fetch(req.url, {
          method: req.method,
          headers,
          body: req.body ?? undefined,
          credentials: "include",
        });
        if (res.ok) {
          succeeded++;
        } else {
          // 4xx / 5xx — the server rejected the request. Discard it so
          // we don't replay indefinitely, but count it separately.
          failed++;
        }
      } catch (err) {
        if (err instanceof TypeError) {
          // Still offline or DNS failure — keep for next flush attempt.
          remaining.push(req);
        } else {
          // Unexpected error — discard to avoid an infinite loop.
          failed++;
        }
      }
    }

    if (remaining.length > 0) {
      await set(QUEUE_KEY, remaining);
    } else {
      await del(QUEUE_KEY);
    }

    return { succeeded, failed };
  });
}
