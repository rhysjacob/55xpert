import { resolveBrand, type Brand } from './brands';

let cached: Brand | undefined;

/**
 * The brand for this page load. Memoised because the hostname cannot change
 * without a full reload, so there is nothing to react to.
 */
export function currentBrand(): Brand {
  cached ??= resolveBrand(window.location.hostname, window.location.search);
  return cached;
}

export function useBrand(): Brand {
  return currentBrand();
}
