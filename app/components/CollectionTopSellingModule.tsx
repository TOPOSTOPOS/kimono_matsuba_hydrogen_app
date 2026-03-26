import {useEffect, useMemo} from 'react';
import {useFetcher} from '@remix-run/react';
import type {ProductCollectionSortKeys} from '@shopify/hydrogen/storefront-api-types';

import type {ProductCardFragment} from 'storefrontapi.generated';
import {Link} from '~/components/Link';
import {ProductCard} from '~/components/ProductCard';
import {Heading, Section} from '~/components/Text';
import {usePrefixPathWithLocale} from '~/lib/utils';

export type CollectionTopSellingApiCollection = {
  id: string;
  handle: string;
  title: string;
  products: {
    nodes: ProductCardFragment[];
  };
};

type CollectionTopSellingApiResponse = {
  collection: CollectionTopSellingApiCollection | null;
};

export type CollectionTopSellingModuleProps = {
  /** コレクションハンドル（必須） */
  collectionHandle: string;
  /** 取得件数（既定 8） */
  count?: number;
  /** 並び（既定 BEST_SELLING = 売れ筋） */
  sortKey?: ProductCollectionSortKeys;
  reverse?: boolean;
  /** 見出しを API の title でなく上書きしたいとき */
  title?: string;
  /** コレクション一覧へのリンク文言 */
  viewAllLabel?: string;
};

const DEFAULT_COUNT = 8;

/**
 * 指定コレクションの売れ筋（BEST_SELLING）などの商品を、タイトル・一覧リンク・横スクロールのサムネイル列で表示する。
 */
export function CollectionTopSellingModule({
  collectionHandle,
  count = DEFAULT_COUNT,
  sortKey = 'BEST_SELLING',
  reverse = false,
  title: titleOverride,
  viewAllLabel = 'すべて見る',
}: CollectionTopSellingModuleProps) {
  const fetcher = useFetcher<CollectionTopSellingApiResponse>();
  const {load} = fetcher;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      handle: collectionHandle,
      count: String(count),
      sortKey,
      reverse: String(reverse),
    });
    return params.toString();
  }, [collectionHandle, count, sortKey, reverse]);

  const apiPath = usePrefixPathWithLocale(
    `/api/collection-top-products?${queryString}`,
  );

  useEffect(() => {
    if (!collectionHandle.trim()) return;
    load(apiPath);
  }, [collectionHandle, apiPath, load]);

  const collection = fetcher.data?.collection;
  const displayTitle = titleOverride ?? collection?.title;
  const handle = collection?.handle ?? collectionHandle;

  const nodes = collection?.products?.nodes ?? [];
  const visible = nodes.slice(0, count);

  const fetchFinished = fetcher.state === 'idle' && fetcher.data !== undefined;
  if (fetchFinished && (!collection || visible.length === 0)) {
    return null;
  }

  const isLoading =
    fetcher.state === 'loading' ||
    (fetcher.state === 'idle' && fetcher.data === undefined);

  return (
    <Section padding="y">
      <div className="flex flex-wrap gap-4 justify-between items-baseline px-6 md:pr-0! lg:pr-0! md:pl-0 lg:pl-0 md:mb-6">
        {displayTitle ? (
          <Heading size="lead" className="mb-0">
            {displayTitle} 人気ランキング
          </Heading>
        ) : (
          <div className="w-48 h-8 rounded animate-pulse bg-primary/5" />
        )}
        <Link
          to={`/collections/${handle}`}
          className="text-sm underline shrink-0 underline-offset-4"
          prefetch="intent"
        >
          {viewAllLabel}
        </Link>
      </div>
      {isLoading && !visible.length ? (
        <div className="px-6 md:px-8 lg:px-12">
          <div className="flex overflow-hidden gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-48 rounded animate-pulse shrink-0 aspect-4/5 bg-primary/5"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="swimlane hiddenScroll md:pb-8 md:scroll-px-8 lg:scroll-px-12 md:px-0 lg:px-0">
          {visible.map((product) => (
            <ProductCard
              product={product}
              key={product.id}
              className="w-48 snap-start"
            />
          ))}
        </div>
      )}
    </Section>
  );
}
