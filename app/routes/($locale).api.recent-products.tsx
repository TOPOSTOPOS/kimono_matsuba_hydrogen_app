import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import invariant from 'tiny-invariant';

import type {ProductCardFragment} from 'storefrontapi.generated';
import {PRODUCT_CARD_FRAGMENT} from '~/data/fragments';

const MAX_IDS = 12;

/**
 * Fetch products by Storefront GIDs (same order as request, minus missing).
 * @see https://shopify.dev/docs/api/storefront/latest/queries/nodes
 */
export async function loader({
  request,
  context: {storefront},
}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) {
    return json({products: []});
  }

  const rawIds = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.startsWith('gid://shopify/Product/'))
    .slice(0, MAX_IDS);

  if (rawIds.length === 0) {
    return json({products: []});
  }

  const data = await storefront.query(RECENT_PRODUCTS_BY_IDS_QUERY, {
    variables: {
      ids: rawIds,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheShort(),
  });

  invariant(data?.nodes, 'No nodes returned from recent products query');

  const byId = new Map<string, ProductCardFragment>();
  for (const node of data.nodes) {
    if (
      node != null &&
      typeof node === 'object' &&
      'id' in node &&
      'variants' in node
    ) {
      const product = node as ProductCardFragment;
      byId.set(product.id, product);
    }
  }

  const ordered: ProductCardFragment[] = [];
  for (const id of rawIds) {
    const p = byId.get(id);
    if (p) ordered.push(p);
  }

  return json({products: ordered});
}

const RECENT_PRODUCTS_BY_IDS_QUERY = `#graphql
  query RecentProductsByIds(
    $ids: [ID!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on Product {
        ...ProductCard
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;

export default function RecentProductsApiRoute() {
  return null;
}
