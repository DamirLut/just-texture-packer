/** `Promise.all` with a concurrency limit, preserving input order in the result. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
