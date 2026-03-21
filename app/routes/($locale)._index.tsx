import {defer} from '@shopify/remix-oxygen';
import type {MetaArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {Suspense} from 'react';
import {Await, useLoaderData, useRouteLoaderData} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';

import {FeaturedCollections} from '~/components/FeaturedCollections';
import {ProductSwimlane} from '~/components/ProductSwimlane';
import {RecentlyViewedSwimlane} from '~/components/RecentlyViewedSwimlane';
import {MEDIA_FRAGMENT, PRODUCT_CARD_FRAGMENT} from '~/data/fragments';
import {getHeroPlaceholder} from '~/lib/placeholders';
import {seoPayload} from '~/lib/seo.server';
import {routeHeaders} from '~/data/cache';
import {HeroSlider} from '~/components/HeroSlider';
import {CollectionTopSellingModule} from '~/components/CollectionTopSellingModule';
import {Nav} from '~/components/Nav';
import type {RootLoader} from '~/root';

/** トップに売れ筋ブロックを出すコレクションハンドル（空なら非表示） */
export const HOMEPAGE_COLLECTION_TOP_SELLING_HANDLE = 'all';

export const HOMEPAGE_COLLECTION_HOUMONGI_HANDLE = 'houmongi';

export const headers = routeHeaders;

export async function loader(args: LoaderFunctionArgs) {
  const {params, context} = args;
  const {language, country} = context.storefront.i18n;

  if (
    params.locale &&
    params.locale.toLowerCase() !== `${language}-${country}`.toLowerCase()
  ) {
    // If the locale URL param is defined, yet we still are on `EN-US`
    // the the locale param must be invalid, send to the 404 page
    throw new Response(null, {status: 404});
  }

  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return defer({...deferredData, ...criticalData});
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: LoaderFunctionArgs) {
  const [{shop, hero}] = await Promise.all([
    context.storefront.query(HOMEPAGE_SEO_QUERY, {
      variables: {handle: 'all'},
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {
    shop,
    primaryHero: hero,
    seo: seoPayload.home(),
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: LoaderFunctionArgs) {
  const {language, country} = context.storefront.i18n;
  const featuredProducts = context.storefront
    .query(HOMEPAGE_FEATURED_PRODUCTS_QUERY, {
      variables: {
        /**
         * Country and language properties are automatically injected
         * into all queries. Passing them is unnecessary unless you
         * want to override them from the following default:
         */
        country,
        language,
      },
    })
    .catch((error) => {
      // Log query errors, but don't throw them so the page can still render
      // eslint-disable-next-line no-console
      console.error(error);
      return null;
    });

  const featuredCollections = context.storefront
    .query(FEATURED_COLLECTIONS_QUERY, {
      variables: {
        country,
        language,
      },
    })
    .catch((error) => {
      // Log query errors, but don't throw them so the page can still render
      // eslint-disable-next-line no-console
      console.error(error);
      return null;
    });

  const heros = context.storefront
    .query(HOMEPAGE_HEROS_QUERY, {
      variables: {
        country,
        language,
      },
    })
    .catch((error) => {
      // Log query errors, but don't throw them so the page can still render
      // eslint-disable-next-line no-console
      console.error(error);
      return null;
    });

  return {
    heros,
    featuredProducts,
    featuredCollections,
  };
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

export default function Homepage() {
  const {heros, featuredCollections, featuredProducts} =
    useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const collectionNav = rootData?.layout?.collectionNav;

  // TODO: skeletons vs placeholders
  const skeletons = getHeroPlaceholder([{}, {}, {}]);

  return (
    <>
      {heros && (
        <Suspense fallback={<div>Loading...</div>}>
          <Await resolve={heros}>
            {(response) => {
              const heroNodes = (response?.collections?.nodes ?? []).filter(
                (collection) => Boolean(collection?.spread?.reference),
              );
              return (
                <HeroSlider
                  heros={heroNodes}
                  height="full"
                  top
                  loading="eager"
                />
              );
            }}
          </Await>
        </Suspense>
      )}

      <div className="flex justify-between pt-10 mx-auto mt-9 w-full max-w-245 pb-15">
        <div className="z-0 order-1 w-full max-w-187">
          <RecentlyViewedSwimlane />
          {featuredProducts && (
            <Suspense>
              <Await resolve={featuredProducts}>
                {(response) => {
                  if (
                    !response ||
                    !response?.products ||
                    !response?.products?.nodes
                  ) {
                    return <></>;
                  }
                  return (
                    <ProductSwimlane
                      products={response.products}
                      title="おすすめ商品"
                      count={4}
                    />
                  );
                }}
              </Await>
            </Suspense>
          )}

          {HOMEPAGE_COLLECTION_TOP_SELLING_HANDLE ? (
            <CollectionTopSellingModule
              collectionHandle={HOMEPAGE_COLLECTION_TOP_SELLING_HANDLE}
              count={10}
            />
          ) : null}

          {HOMEPAGE_COLLECTION_HOUMONGI_HANDLE ? (
            <CollectionTopSellingModule
              collectionHandle={HOMEPAGE_COLLECTION_HOUMONGI_HANDLE}
              count={10}
            />
          ) : null}

          {featuredCollections && (
            <Suspense>
              <Await resolve={featuredCollections}>
                {(response) => {
                  if (
                    !response ||
                    !response?.collections ||
                    !response?.collections?.nodes
                  ) {
                    return <></>;
                  }
                  return (
                    <FeaturedCollections
                      collections={response.collections}
                      title="すべてのカテゴリ"
                    />
                  );
                }}
              </Await>
            </Suspense>
          )}
        </div>
        <div className="w-full max-w-48">
          <Nav collectionNav={collectionNav} />
        </div>
      </div>
    </>
  );
}

const COLLECTION_CONTENT_FRAGMENT = `#graphql
  fragment CollectionContent on Collection {
    id
    handle
    title
    descriptionHtml
    heading: metafield(namespace: "hero", key: "title") {
      value
    }
    byline: metafield(namespace: "hero", key: "byline") {
      value
    }
    cta: metafield(namespace: "hero", key: "cta") {
      value
    }
    spread: metafield(namespace: "hero", key: "spread") {
      reference {
        ...Media
      }
    }
    spreadSecondary: metafield(namespace: "hero", key: "spread_secondary") {
      reference {
        ...Media
      }
    }
  }
  ${MEDIA_FRAGMENT}
` as const;

const HOMEPAGE_SEO_QUERY = `#graphql
  query seoCollectionContent($handle: String, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    hero: collection(handle: $handle) {
      ...CollectionContent
    }
    shop {
      name
      description
    }
  }
  ${COLLECTION_CONTENT_FRAGMENT}
` as const;

const HOMEPAGE_HEROS_QUERY = `#graphql
  query homepageHeros($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    collections(first: 8, sortKey: UPDATED_AT) {
      nodes {
        ...CollectionContent
      }
    }
  }
  ${COLLECTION_CONTENT_FRAGMENT}
` as const;

// @see: https://shopify.dev/api/storefront/current/queries/products
export const HOMEPAGE_FEATURED_PRODUCTS_QUERY = `#graphql
  query homepageFeaturedProducts($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: 8, query: "-tag:帯 AND -tag:オプション") {
      nodes {
        ...ProductCard
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;

// @see: https://shopify.dev/api/storefront/current/queries/collections
export const FEATURED_COLLECTIONS_QUERY = `#graphql
  query homepageFeaturedCollections($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    collections(
      first: 4,
      sortKey: UPDATED_AT
    ) {
      nodes {
        id
        title
        handle
        image {
          altText
          width
          height
          url
        }
      }
    }
  }
` as const;
