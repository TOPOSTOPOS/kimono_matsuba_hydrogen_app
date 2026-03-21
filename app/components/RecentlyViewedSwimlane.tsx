import {useEffect, useMemo, useState} from 'react';
import {useFetcher} from '@remix-run/react';

import type {ProductCardFragment} from 'storefrontapi.generated';
import {ProductSwimlane} from '~/components/ProductSwimlane';
import {useIsHydrated} from '~/hooks/useIsHydrated';
import {getRecentlyViewedProductIds} from '~/lib/recently-viewed-products';
import {usePrefixPathWithLocale} from '~/lib/utils';

type RecentProductsApiData = {
  products: ProductCardFragment[];
};

const TITLE = '最近チェックした商品';
const COUNT = 8;

/**
 * localStorage の閲覧履歴を読み、API で ProductCard 用データを取得してスイムレーン表示する。
 */
export function RecentlyViewedSwimlane() {
  const isHydrated = useIsHydrated();
  const [ids, setIds] = useState<string[]>([]);
  const fetcher = useFetcher<RecentProductsApiData>();
  const {load} = fetcher;

  useEffect(() => {
    if (!isHydrated) return;
    setIds(getRecentlyViewedProductIds());
  }, [isHydrated]);

  const apiPath = usePrefixPathWithLocale(
    ids.length > 0
      ? `/api/recent-products?ids=${encodeURIComponent(ids.join(','))}`
      : '/api/recent-products',
  );

  useEffect(() => {
    if (ids.length === 0) return;
    load(apiPath);
  }, [ids, apiPath, load]);

  const products = useMemo(() => {
    if (!fetcher.data?.products?.length) return null;
    return {nodes: fetcher.data.products.slice(0, COUNT)};
  }, [fetcher.data]);

  if (!isHydrated || ids.length === 0 || !products?.nodes.length) {
    return null;
  }

  return <ProductSwimlane title={TITLE} products={products} count={COUNT} />;
}
