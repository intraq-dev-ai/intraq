const CONCURRENCY = 5;

interface QueueEntry {
  order: number;
  task: () => Promise<void>;
}

const queue: QueueEntry[] = [];
let active = 0;

export function enqueueVisualizationLoad<T>(order: number, task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      order,
      task: async () => {
        try { resolve(await task()); } catch (e) { reject(e); }
      }
    });
    queue.sort((a, b) => a.order - b.order);
    scheduleNext();
  });
}

export function clearVisualizationQueue(): void {
  queue.length = 0;
}

function scheduleNext(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const entry = queue.shift()!;
    active++;
    void entry.task().finally(() => {
      active--;
      scheduleNext();
    });
  }
}
