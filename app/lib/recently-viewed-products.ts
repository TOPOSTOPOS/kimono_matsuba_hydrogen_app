const STORAGE_KEY = 'hataori:recentlyViewedProductIds';
const MAX_ITEMS = 12;

function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Storefront Product GID の配列（新しい順）を返す。
 */
export function getRecentlyViewedProductIds(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is string =>
        typeof id === 'string' && id.startsWith('gid://shopify/Product/'),
    );
  } catch {
    return [];
  }
}

/**
 * 閲覧した商品の GID を先頭に追加（重複除去・最大件数）。
 * SSR では何もしない。
 */
export function pushRecentlyViewedProductId(productId: string): void {
  if (!isBrowser()) return;
  if (!productId.startsWith('gid://shopify/Product/')) return;

  const prev = getRecentlyViewedProductIds();
  const next = [productId, ...prev.filter((id) => id !== productId)].slice(
    0,
    MAX_ITEMS,
  );

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
}
