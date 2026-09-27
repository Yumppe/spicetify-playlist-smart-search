import { fiberChainFrom, propsForFiber } from './react-internals.js';
import { consoleWarn } from '../utils.js';

let nativeFilterSuppressed = false;

function searchControllerFor(input) {
  if (!input) return null;
  for (const fiber of fiberChainFrom(input, 32)) {
    const props = propsForFiber(fiber);
    if (!props || (typeof props.onFilter !== 'function' && typeof props.onClear !== 'function')) continue;
    let hook = fiber.memoizedState;
    let textHook = null;
    let guard = 0;
    while (hook && guard++ < 24) {
      if (typeof hook.memoizedState === 'string' && typeof hook.queue?.dispatch === 'function') {
        textHook = hook;
        break;
      }
      hook = hook.next;
    }
    return { props, textHook };
  }
  return null;
}

export function suppressSpotifyNativeFilter(input, value) {
  const controller = searchControllerFor(input);
  if (!nativeFilterSuppressed) {
    nativeFilterSuppressed = true;
    try { controller?.props?.onClear?.(); }
    catch (error) { consoleWarn('Could not clear Spotify native playlist filter.', error); }
  }
  queueMicrotask(() => {
    try { controller?.textHook?.queue?.dispatch?.(value); }
    catch (error) { consoleWarn('Could not synchronize Spotify search text state.', error); }
  });
}

export function releaseSpotifyNativeFilterSuppression() {
  nativeFilterSuppressed = false;
}
