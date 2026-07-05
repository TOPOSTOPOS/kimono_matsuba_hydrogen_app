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
import {
  COLLECTION_CONTENT_FRAGMENT,
  PRODUCT_CARD_FRAGMENT,
} from '~/data/fragments';
import {seoPayload} from '~/lib/seo.server';
import {routeHeaders} from '~/data/cache';
import {HeroSlider} from '~/components/HeroSlider';
import {ClientOnly} from '~/components/ClientOnly';
import {CollectionTopSellingModule} from '~/components/CollectionTopSellingModule';
import {Nav} from '~/components/Nav';
import type {RootLoader} from '~/root';

export const BUY_COLLECTION_HANDLE = 'buy';
export const RENT_COLLECTION_HANDLE = 'rental';

/** トップに売れ筋ブロックを出すコレクションハンドル（空なら非表示） */
export const HOMEPAGE_COLLECTION_TOP_SELLING_HANDLE = 'all';

export const HOMEPAGE_COLLECTION_HOUMONGI_HANDLE = 'furisode-rental';

/** スライダーに載せる最大枚数 */
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
  const {language, country} = context.storefront.i18n;
  const [{shop, hero}, herosData] = await Promise.all([
    context.storefront.query(HOMEPAGE_SEO_QUERY, {
      variables: {handle: 'all'},
    }),
    context.storefront
      .query(HOMEPAGE_HEROS_QUERY, {variables: {country, language}})
      .catch(() => null),
  ]);

  const heroNodes =
    (herosData as any)?.metaobjects?.nodes?.[0]?.slides?.references?.nodes ??
    [];

  return {
    shop,
    primaryHero: hero,
    seo: seoPayload.home(),
    heroNodes,
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

  return {
    featuredProducts,
    featuredCollections,
    categoryMenus,
  };
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

export default function Homepage() {
  const {heroNodes, featuredCollections, featuredProducts, categoryMenus} =
    useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const collectionNav = rootData?.layout?.collectionNav;

  return (
    <>
      {heroNodes.length > 0 && (
        <ClientOnly>
          {() => (
            <HeroSlider heros={heroNodes} height="full" top loading="eager" />
          )}
        </ClientOnly>
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

          <div className="grid grid-cols-2 gap-4 px-6 sm:px-0">
            <h2 className="text-xl font-bold">すべてのカテゴリ</h2>
          </div>

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
      <AboutMatsuba />
    </>
  );
}

function AboutMatsuba() {
  return (
    <section className="w-full bg-gray-50">
      <div className="flex flex-col gap-8 items-center px-6 py-14 mx-auto max-w-245 md:flex-row md:gap-12 md:px-8">
        <div className="w-full md:w-1/2">
          <img
            src="/images/about-matsuba.jpg"
            alt="本きもの松葉"
            loading="lazy"
            className="object-cover w-full"
          />
        </div>
        <div className="w-full text-center md:w-1/2">
          <h2 className="mb-6 text-xl font-bold">本きもの松葉について</h2>
          <p className="text-sm leading-loose text-primary/80 whitespace-pre-line">
            {`着物に袖を通す日は、かけがえのない大切な日。
その一日を、心から誇れる一着で迎えてほしい――
私たち本きもの松葉は、1977年創業の老舗呉服店として、
長年の目利きと仕入れを活かし、
すべて正絹の振袖を高品質・お値打ち価格でお届けしています。`}
          </p>
        </div>
      </div>
    </section>
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
    metaobjects(type: "homepage_hero", first: 1) {
      nodes {
        slides: field(key: "slides") {
          references(first: ${HOMEPAGE_HERO_SLIDES_MAX}) {
            nodes {
              ... on Collection {
                ...CollectionContent
              }
            }
          }
        }
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
