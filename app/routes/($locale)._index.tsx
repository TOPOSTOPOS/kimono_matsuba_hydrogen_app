import {defer} from '@shopify/remix-oxygen';
import type {MetaArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {Suspense} from 'react';
import {
  Await,
  Link,
  useLoaderData,
  useLocation,
  useRouteLoaderData,
} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';

import {FeaturedCollections} from '~/components/FeaturedCollections';
import {CategoryMenuGrid} from '~/components/CategoryMenuGrid';
import type {CategoryMenuData} from '~/components/CategoryMenuGrid';
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
import type {HomepageHerosQuery} from 'storefrontapi.generated';

/** 開発時のみ: ヒーロースライダー用コレクションデータの切り分けログ */
function logHomepageHeroDebug(
  source: 'loader' | 'ui',
  response: HomepageHerosQuery | null | undefined,
) {
  if (!import.meta.env.DEV || !response?.collections?.nodes) {
    return;
  }
  const nodes = response.collections.nodes;
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[HeroDebug:${source}] homepageHeros: API は ${nodes.length} 件（first:${HOMEPAGE_HERO_COLLECTIONS_FETCH_FIRST}, UPDATED_AT）`,
  );
  for (const c of nodes) {
    const ref = c.spread?.reference as {__typename?: string} | null | undefined;
    // eslint-disable-next-line no-console
    console.log(c.handle, {
      title: c.title?.slice(0, 40),
      hasSpreadReference: Boolean(ref),
      spreadRefTypename: ref?.__typename ?? null,
      heroTitle: c.heading?.value ? 'set' : 'empty',
      heroByline: c.byline?.value ? 'set' : 'empty',
      heroCta: c.cta?.value ? 'set' : 'empty',
    });
  }
  const passed = nodes
    .filter((c) => Boolean(c.spread?.reference))
    .slice(0, HOMEPAGE_HERO_SLIDES_MAX);
  // eslint-disable-next-line no-console
  console.log(
    `[HeroDebug:${source}] spread.reference あり → 最大 ${HOMEPAGE_HERO_SLIDES_MAX} 件で HeroSlider へ ${passed.length} 件`,
    passed.map((c) => c.handle),
  );
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/** 買う / 借りる タブのリンク先コレクションハンドル */
export const BUY_COLLECTION_HANDLE = 'buy';
export const RENT_COLLECTION_HANDLE = 'rental';

/** トップに売れ筋ブロックを出すコレクションハンドル（空なら非表示） */
export const HOMEPAGE_COLLECTION_TOP_SELLING_HANDLE = 'all';

export const HOMEPAGE_COLLECTION_HOUMONGI_HANDLE = 'houmongi';

/**
 * ヒーロー候補として Storefront から取るコレクション数（更新が新しい順）。
 * first: 8 だけだと spread 未設定の新規ばかりになりやすいので多めに取り、下記 MAX で絞る。
 */
export const HOMEPAGE_HERO_COLLECTIONS_FETCH_FIRST = 50;

/** スライダーに載せる最大枚数（spread ありのものからこの件数まで） */
export const HOMEPAGE_HERO_SLIDES_MAX = 8;

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

  const categoryMenus = context.storefront
    .query(CATEGORY_MENUS_QUERY, {
      variables: {
        country,
        language,
      },
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      return null;
    });

  const heros = context.storefront
    .query(HOMEPAGE_HEROS_QUERY, {
      variables: {
        country,
        language,
        heroCollectionsFirst: HOMEPAGE_HERO_COLLECTIONS_FETCH_FIRST,
      },
    })
    .then((data) => {
      logHomepageHeroDebug('loader', data);
      return data;
    })
    .catch((error) => {
      // Log query errors, but don't throw them so the page can still render
      // eslint-disable-next-line no-console
      console.error(error);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[HeroDebug:loader] homepageHeros クエリ失敗 → HeroSlider 非表示',
        );
      }
      return null;
    });

  return {
    heros,
    featuredProducts,
    featuredCollections,
    categoryMenus,
  };
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

export default function Homepage() {
  const {heros, featuredCollections, featuredProducts, categoryMenus} =
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
            {(response: HomepageHerosQuery | null) => {
              logHomepageHeroDebug('ui', response ?? undefined);
              const heroNodes = (response?.collections?.nodes ?? [])
                .filter((collection) => Boolean(collection?.spread?.reference))
                .slice(0, HOMEPAGE_HERO_SLIDES_MAX);
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
      <BuyOrRentTabs />
      <div className="flex justify-between mx-auto mt-9 w-full sm:pt-10 max-w-245 pb-15">
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

          {categoryMenus && (
            <Suspense>
              <Await resolve={categoryMenus}>
                {(response) => {
                  if (!response) return <></>;
                  const r = response as {
                    categoriesMenu?: CategoryMenuData | null;
                    categoriesRentalMenu?: CategoryMenuData | null;
                    categoriesCleaningMenu?: CategoryMenuData | null;
                    sceneMenu?: CategoryMenuData | null;
                  };
                  return (
                    <CategoryMenuGrid
                      categoriesMenu={r.categoriesMenu}
                      categoriesRentalMenu={r.categoriesRentalMenu}
                      categoriesCleaningMenu={r.categoriesCleaningMenu}
                      sceneMenu={r.sceneMenu}
                    />
                  );
                }}
              </Await>
            </Suspense>
          )}
        </div>
        <div className="hidden w-full max-w-48 sm:block">
          <Nav collectionNav={collectionNav} />
        </div>
      </div>
    </>
  );
}

function BuyOrRentTabs() {
  const {pathname} = useLocation();
  const buyPath = `/collections/${BUY_COLLECTION_HANDLE}`;
  const rentPath = `/collections/${RENT_COLLECTION_HANDLE}`;

  const isBuy = pathname.startsWith(buyPath);
  const isRent = pathname.startsWith(rentPath);

  const baseClass =
    'relative flex flex-1 items-center justify-center gap-2 py-4 text-sm font-medium tracking-wide transition-colors duration-200 focus-visible:outline-none';
  const activeClass =
    'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary';
  const inactiveClass = 'text-primary/80 hover:text-primary/50';

  return (
    <div className="sticky top-(--height-nav) z-10 w-full border-b border-primary/10 bg-contrast">
      <div className="flex mx-auto max-w-245">
        <Link
          to={buyPath}
          prefetch="intent"
          className={`${baseClass} ${isBuy ? activeClass : inactiveClass}`}
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          買う
        </Link>
        <div className="self-stretch w-px bg-primary/10" aria-hidden="true" />
        <Link
          to={rentPath}
          prefetch="intent"
          className={`${baseClass} ${isRent ? activeClass : inactiveClass}`}
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          借りる
        </Link>
      </div>
    </div>
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
  query homepageHeros($country: CountryCode, $language: LanguageCode, $heroCollectionsFirst: Int!)
  @inContext(country: $country, language: $language) {
    collections(first: $heroCollectionsFirst, sortKey: UPDATED_AT) {
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

export const CATEGORY_MENUS_QUERY = `#graphql
  query categoryMenus($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    categoriesMenu: menu(handle: "category-nav") {
      id
      items {
        id
        title
        url
        items {
          id
          title
          url
        }
      }
    }
    categoriesRentalMenu: menu(handle: "category-nav-rental") {
      id
      items {
        id
        title
        url
        items {
          id
          title
          url
        }
      }
    }
    categoriesCleaningMenu: menu(handle: "category-nav-cleaning") {
      id
      items {
        id
        title
        url
        items {
          id
          title
          url
        }
      }
    }
    sceneMenu: menu(handle: "link-list-scene") {
      id
      items {
        id
        title
        url
        items {
          id
          title
          url
        }
      }
    }
  }
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
