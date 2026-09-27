export function reactFiberFor(element) {
  if (!element) return null;
  for (const key of Object.getOwnPropertyNames(element)) {
    if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$')) continue;
    try { return element[key] ?? null; } catch { return null; }
  }
  return null;
}

export function fiberChainFromFiber(start, maxDepth = 48) {
  const result = [];
  let fiber = start;
  const seen = new Set();
  while (fiber && result.length < maxDepth && !seen.has(fiber)) {
    seen.add(fiber);
    result.push(fiber);
    fiber = fiber.return;
  }
  return result;
}

export function fiberChainFrom(element, maxDepth = 48) {
  return fiberChainFromFiber(reactFiberFor(element), maxDepth);
}

export function propsForFiber(fiber) {
  return fiber?.memoizedProps && typeof fiber.memoizedProps === 'object'
    ? fiber.memoizedProps
    : fiber?.pendingProps && typeof fiber.pendingProps === 'object'
      ? fiber.pendingProps
      : null;
}
