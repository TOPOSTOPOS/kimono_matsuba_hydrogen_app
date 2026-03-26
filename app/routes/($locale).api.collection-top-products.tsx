import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import type {ProductCollectionSortKeys} from '@shopify/hydrogen/storefront-api-types';

import {PRODUCT_CARD_FRAGMENT} from '~/data/fragments';

const DEFAULT_COUNT = 8;
const MAX_COUNT = 24;

/**
 * GET ?handle=...&count=...&sortKey=BEST_SELLING&reverse=false
 * コレクションの売れ筋など、指定 sort の商品一覧（ProductCard フラグメント）。
 */
export async function loader({
  request,
  context: {storefront},
}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const handle = url.searchParams.get('handle')?.trim();
  if (!handle) {
    return json({collection: null}, {status: 400});
  }

  let count = DEFAULT_COUNT;
  const countParam = url.searchParams.get('count');
  if (countParam) {
    const n = parseInt(countParam, 10);
    if (!Number.isNaN(n) && n > 0) {
      count = Math.min(n, MAX_COUNT);
    }
  }

  const sortKey =
    (url.searchParams.get('sortKey') as ProductCollectionSortKeys | null) ??
    'BEST_SELLING';

  let reverse = false;
  if (url.searchParams.get('reverse') === 'true') {
    reverse = true;
  }

  const data = await storefront.query(COLLECTION_TOP_PRODUCTS_QUERY, {
    variables: {
      handle,
      first: count,
      sortKey,
      reverse,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheLong(),
  });

  if (!data?.collection) {
    return json({collection: null});
  }

  return json({
    collection: {
      id: data.collection.id,
      handle: data.collection.handle,
      title: data.collection.title,
      products: data.collection.products,
    },
  });
}

const COLLECTION_TOP_PRODUCTS_QUERY = `#graphql
  query CollectionTopProducts(
    $handle: String!
    $first: Int!
    $sortKey: ProductCollectionSortKeys!
    $reverse: Boolean
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      products(first: $first, sortKey: $sortKey, reverse: $reverse) {
        nodes {
          ...ProductCard
        }
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;

export default function CollectionTopProductsApiRoute() {
  return null;
}
