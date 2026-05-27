import {useEffect} from 'react';
import {
  json,
  type MetaArgs,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {useLoaderData, useNavigate, useRouteLoaderData} from '@remix-run/react';
import {useInView} from 'react-intersection-observer';
import invariant from 'tiny-invariant';
import {
  Pagination,
  getPaginationVariables,
  getSeoMeta,
} from '@shopify/hydrogen';

import {PageHeader, Section} from '~/components/Text';
import {ProductCard} from '~/components/ProductCard';
import {Grid} from '~/components/Grid';
import {Button} from '~/components/Button';
import {PRODUCT_CARD_FRAGMENT} from '~/data/fragments';
import {getImageLoadingPriority} from '~/lib/const';
import {seoPayload} from '~/lib/seo.server';
import {routeHeaders} from '~/data/cache';
import {Nav} from '~/components/Nav';
import type {RootLoader} from '~/root';

const PAGE_BY = 8;

export const headers = routeHeaders;

export async function loader({
  request,
  context: {storefront},
}: LoaderFunctionArgs) {
  const variables = getPaginationVariables(request, {pageBy: PAGE_BY});

  const data = await storefront.query(ALL_PRODUCTS_QUERY, {
    variables: {
      ...variables,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
  });

  invariant(data, 'No data returned from Shopify API');

  const seo = seoPayload.collection({
    url: request.url,
    collection: {
      id: 'all-products',
      title: 'すべての商品',
      handle: 'products',
      descriptionHtml: 'All the store products',
      description: 'All the store products',
      seo: {
        title: 'すべての商品',
        description: 'All the store products',
      },
      metafields: [],
      products: data.products,
      updatedAt: '',
    },
  });

  return json({
    products: data.products,
    seo,
  });
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

export default function AllProducts() {
  const {products} = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const collectionNav = rootData?.layout?.collectionNav;
  const {ref, inView} = useInView();

  return (
    <div className="flex justify-between pt-10 mx-auto mt-9 w-full md:max-w-245 pb-15">
      <div className="z-0 order-1 w-full max-w-187">
        <PageHeader
          heading="すべての商品"
          variant="allCollections"
          className="sm:pt-0! sm:px-0!"
        />
        <Section>
          <Pagination connection={products}>
            {({nodes, isLoading, PreviousLink, NextLink, nextPageUrl, hasNextPage, state}) => (
              <>
                <div className="flex justify-center items-center mb-6">
                  <Button as={PreviousLink} variant="secondary" width="full">
                    {isLoading ? 'Loading...' : 'Load previous'}
                  </Button>
                </div>
                <ProductsLoadedOnScroll
                  nodes={nodes}
                  inView={inView}
                  nextPageUrl={nextPageUrl}
                  hasNextPage={hasNextPage}
                  state={state}
                />
                <div className="flex justify-center items-center mt-6">
                  <Button ref={ref} as={NextLink} variant="secondary" width="full">
                    {isLoading ? 'Loading...' : 'Load more products'}
                  </Button>
                </div>
              </>
            )}
          </Pagination>
        </Section>
      </div>
      <div className="hidden w-full max-w-48 sm:block">
        <Nav collectionNav={collectionNav} />
      </div>
    </div>
  );
}

function ProductsLoadedOnScroll({
  nodes,
  inView,
  nextPageUrl,
  hasNextPage,
  state,
}: {
  nodes: any;
  inView: boolean;
  nextPageUrl: string;
  hasNextPage: boolean;
  state: any;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (inView && hasNextPage) {
      navigate(nextPageUrl, {
        replace: true,
        preventScrollReset: true,
        state,
      });
    }
  }, [inView, navigate, state, nextPageUrl, hasNextPage]);

  return (
    <Grid layout="products" data-test="product-grid" items={4}>
      {nodes.map((product: any, i: number) => (
        <ProductCard
          key={product.id}
          product={product}
          loading={getImageLoadingPriority(i)}
        />
      ))}
    </Grid>
  );
}

const ALL_PRODUCTS_QUERY = `#graphql
  query AllProducts(
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    products(first: $first, last: $last, before: $startCursor, after: $endCursor, query: "-tag:帯 AND -tag:オプション") {
      nodes {
        ...ProductCard
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        startCursor
        endCursor
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;
