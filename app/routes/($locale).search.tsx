import {
  defer,
  type MetaArgs,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {Await, Form, useLoaderData, useRouteLoaderData} from '@remix-run/react';
import {Suspense} from 'react';
import {
  Pagination,
  getPaginationVariables,
  Analytics,
  getSeoMeta,
} from '@shopify/hydrogen';

import {Heading, PageHeader, Section, Text} from '~/components/Text';
import {Input} from '~/components/Input';
import {Grid} from '~/components/Grid';
import {ProductCard} from '~/components/ProductCard';
import {ProductSwimlane} from '~/components/ProductSwimlane';
import {FeaturedCollections} from '~/components/FeaturedCollections';
import {PRODUCT_CARD_FRAGMENT} from '~/data/fragments';
import {getImageLoadingPriority, PAGINATION_SIZE} from '~/lib/const';
import {seoPayload} from '~/lib/seo.server';
import {Nav} from '~/components/Nav';
import type {RootLoader} from '~/root';

import {
  getFeaturedData,
  type FeaturedData,
} from './($locale).featured-products';

export async function loader({
  request,
  context: {storefront},
}: LoaderFunctionArgs) {
  const searchParams = new URL(request.url).searchParams;
  const searchTerm = searchParams.get('q')!;
  const variables = getPaginationVariables(request, {pageBy: 8});

  const {products} = await storefront.query(SEARCH_QUERY, {
    variables: {
      searchTerm,
      ...variables,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
  });

  const shouldGetRecommendations = !searchTerm || products?.nodes?.length === 0;

  const seo = seoPayload.collection({
    url: request.url,
    collection: {
      id: 'search',
      title: 'Search',
      handle: 'search',
      descriptionHtml: 'Search results',
      description: 'Search results',
      seo: {
        title: 'Search',
        description: `Showing ${products.nodes.length} search results for "${searchTerm}"`,
      },
      metafields: [],
      products,
      updatedAt: new Date().toISOString(),
    },
  });

  return defer({
    seo,
    searchTerm,
    products,
    noResultRecommendations: shouldGetRecommendations
      ? getNoResultRecommendations(storefront)
      : Promise.resolve(null),
  });
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

export default function Search() {
  const {searchTerm, products, noResultRecommendations} =
    useLoaderData<typeof loader>();
  const noResults = products?.nodes?.length === 0;

  const rootData = useRouteLoaderData<RootLoader>('root');
  const collectionNav = rootData?.layout?.collectionNav;

  return (
    <>
      <div className="flex justify-between pt-10 mx-auto mt-9 w-full max-w-245 pb-15">
        <div className="z-0 order-1 w-full max-w-187">
          <PageHeader className="sm:pt-0! sm:px-0!">
            <Heading as="h1" size="copy">
              キーワード検索
            </Heading>
            <Form method="get" className="flex relative w-full text-base">
              <Input
                defaultValue={searchTerm}
                name="q"
                placeholder="キーワードを入力してください"
                type="search"
                variant="search"
              />
              <button className="absolute right-0 py-2" type="submit">
                検索する
              </button>
            </Form>
          </PageHeader>
          {!searchTerm || noResults ? (
            <NoResults
              noResults={noResults}
              recommendations={noResultRecommendations}
            />
          ) : (
            <Section>
              <Pagination connection={products}>
                {({nodes, isLoading, NextLink, PreviousLink}) => {
                  const itemsMarkup = nodes.map((product, i) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      loading={getImageLoadingPriority(i)}
                    />
                  ));

                  return (
                    <>
                      <div className="flex justify-center items-center mt-6">
                        <PreviousLink className="inline-block px-6 py-3 w-full font-medium text-center rounded-sm border border-primary/10 bg-contrast text-primary">
                          {isLoading ? 'Loading...' : 'Previous'}
                        </PreviousLink>
                      </div>
                      <Grid data-test="product-grid">{itemsMarkup}</Grid>
                      <div className="flex justify-center items-center mt-6">
                        <NextLink className="inline-block px-6 py-3 w-full font-medium text-center rounded-sm border border-primary/10 bg-contrast text-primary">
                          {isLoading ? 'Loading...' : 'Next'}
                        </NextLink>
                      </div>
                    </>
                  );
                }}
              </Pagination>
            </Section>
          )}
        </div>
        <div className="hidden w-full max-w-48 sm:block">
          <Nav collectionNav={collectionNav} />
        </div>
      </div>
      <Analytics.SearchView data={{searchTerm, searchResults: products}} />
    </>
  );
}

function NoResults({
  noResults,
  recommendations,
}: {
  noResults: boolean;
  recommendations: Promise<null | FeaturedData>;
}) {
  return (
    <>
      {noResults && (
        <Section padding="x">
          <Text className="opacity-50">検索結果が見つかりませんでした。</Text>
        </Section>
      )}
      <Suspense>
        <Await
          errorElement="There was a problem loading related products"
          resolve={recommendations}
        >
          {(result) => {
            if (!result) return null;
            const {featuredCollections, featuredProducts} = result;

            return (
              <>
                <FeaturedCollections
                  title="人気のコレクション"
                  collections={featuredCollections}
                />
                <ProductSwimlane
                  title="人気の商品"
                  products={featuredProducts}
                />
              </>
            );
          }}
        </Await>
      </Suspense>
    </>
  );
}

export function getNoResultRecommendations(
  storefront: LoaderFunctionArgs['context']['storefront'],
) {
  return getFeaturedData(storefront, {pageBy: PAGINATION_SIZE});
}

const SEARCH_QUERY = `#graphql
  query PaginatedProductsSearch(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $searchTerm: String
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    products(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor,
      sortKey: RELEVANCE,
      query: $searchTerm
    ) {
      nodes {
        ...ProductCard
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }

  ${PRODUCT_CARD_FRAGMENT}
` as const;
