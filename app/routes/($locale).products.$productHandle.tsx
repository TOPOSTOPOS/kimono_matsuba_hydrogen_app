import type {ChangeEvent} from 'react';
import {useRef, Suspense, useState} from 'react';
import {Disclosure, Listbox} from '@headlessui/react';
import {
  defer,
  type MetaArgs,
  redirect,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {useLoaderData, Await, useNavigate} from '@remix-run/react';
import {
  getSeoMeta,
  Money,
  VariantSelector,
  getSelectedProductOptions,
  Analytics,
} from '@shopify/hydrogen';
import invariant from 'tiny-invariant';
import clsx from 'clsx';
import DatePicker, {registerLocale} from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {subDays} from 'date-fns';
import {ja} from 'date-fns/locale/ja';

import type {
  ProductQuery,
  ProductVariantFragmentFragment,
} from 'storefrontapi.generated';
import {Heading, Section, Text} from '~/components/Text';
import {Link} from '~/components/Link';
import {Button} from '~/components/Button';
import {AddToCartButton} from '~/components/AddToCartButton';
import {Skeleton} from '~/components/Skeleton';
import {ProductSwimlane} from '~/components/ProductSwimlane';
import {ProductGallery} from '~/components/ProductGallery';
import {IconCaret, IconCheck, IconClose} from '~/components/Icon';
import {getExcerpt} from '~/lib/utils';
import {seoPayload} from '~/lib/seo.server';
import type {Storefront} from '~/lib/type';
import {routeHeaders} from '~/data/cache';
import {MEDIA_FRAGMENT, PRODUCT_CARD_FRAGMENT} from '~/data/fragments';

export const headers = routeHeaders;

export async function loader(args: LoaderFunctionArgs) {
  const {productHandle} = args.params;
  invariant(productHandle, 'Missing productHandle param, check route filename');

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
async function loadCriticalData({
  params,
  request,
  context,
}: LoaderFunctionArgs) {
  const {productHandle} = params;
  invariant(productHandle, 'Missing productHandle param, check route filename');

  const selectedOptions = getSelectedProductOptions(request);

  const [{shop, product}, deliverTimeOptions, cart, tabiOptions] =
    await Promise.all([
      context.storefront.query(PRODUCT_QUERY, {
        variables: {
          handle: productHandle,
          selectedOptions,
          country: context.storefront.i18n.country,
          language: context.storefront.i18n.language,
        },
      }),
      context.storefront.query(DELIVERY_TIME_OPTIONS_QUERY),
      context.cart.get(),
      context.storefront.query(TABI_OPTIONS_QUERY),
      // Add other queries here, so that they are loaded in parallel
    ]);

  const sortedDeliverTimeOptions = deliverTimeOptions.metaobjects.nodes
    .sort((a, b) => {
      const orderA = parseInt(
        a.fields.find((field) => field.key === 'sort_order')?.value || '0',
        10,
      );
      const orderB = parseInt(
        b.fields.find((field) => field.key === 'sort_order')?.value || '0',
        10,
      );
      return orderA - orderB;
    })
    .map(
      (node) =>
        node.fields.find((field) => field.key === 'time')?.value || null,
    )
    .filter((value) => value != null);

  const tabiOptionTargets = tabiOptions.metaobjects.nodes
    .map((node) => node.fields.find((field) => field.key === 'target')?.value)
    .filter((value) => value != null);

  const tabiOptionSizes: {[key: string]: string[]} = {};
  tabiOptions.metaobjects.nodes.forEach((node) => {
    const size = node.fields.find((field) => field.key === 'size')?.value;
    const target = node.fields.find((field) => field.key === 'target')?.value;

    if (!target || !size) {
      return;
    }
    tabiOptionSizes[target] = JSON.parse(size) as string[];
  });

  if (sortedDeliverTimeOptions.length == 0) {
    throw new Response('delivery time options not found', {status: 404});
  }

  if (!product?.id) {
    throw new Response('product', {status: 404});
  }

  if (!product.selectedVariant) {
    throw redirectToFirstVariant({product, request});
  }

  const recommended = getRecommendedProducts(context.storefront, product.id);

  // TODO: firstVariant is never used because we will always have a selectedVariant due to redirect
  // Investigate if we can avoid the redirect for product pages with no search params for first variant
  const firstVariant = product.variants.nodes[0];
  const selectedVariant = product.selectedVariant ?? firstVariant;

  const seo = seoPayload.product({
    product,
    selectedVariant,
    url: request.url,
  });

  return {
    product,
    shop,
    storeDomain: shop.primaryDomain.url,
    recommended,
    seo,
    sortedDeliverTimeOptions,
    cart,
    tabiOptionTargets,
    tabiOptionSizes,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({params, context}: LoaderFunctionArgs) {
  const {productHandle} = params;
  invariant(productHandle, 'Missing productHandle param, check route filename');

  // In order to show which variants are available in the UI, we need to query
  // all of them. But there might be a *lot*, so instead separate the variants
  // into it's own separate query that is deferred. So there's a brief moment
  // where variant options might show as available when they're not, but after
  // this deferred query resolves, the UI will update.
  const variants = context.storefront.query(VARIANTS_QUERY, {
    variables: {
      handle: productHandle,
      country: context.storefront.i18n.country,
      language: context.storefront.i18n.language,
    },
  });

  return {variants};
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

function redirectToFirstVariant({
  product,
  request,
}: {
  product: ProductQuery['product'];
  request: Request;
}) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);

  const firstVariant = product!.variants.nodes[0];
  for (const option of firstVariant.selectedOptions) {
    searchParams.set(option.name, option.value);
  }

  url.search = searchParams.toString();

  return redirect(url.href.replace(url.origin, ''), 302);
}

export default function Product() {
  const {product, shop, recommended, variants, cart} =
    useLoaderData<typeof loader>();
  const {media, title, vendor, descriptionHtml} = product;
  const {shippingPolicy, refundPolicy} = shop;

  const cartTotalQuantity = cart ? cart.totalQuantity : 0;

  return (
    <>
      <Section className="px-0 md:px-8 lg:px-12">
        <div className="grid items-start md:gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
          <ProductGallery
            media={media.nodes}
            className="w-full lg:col-span-2"
          />
          <div className="sticky md:-mb-nav md:top-nav md:-translate-y-nav md:h-screen md:pt-nav hiddenScroll md:overflow-y-scroll">
            <section className="flex flex-col w-full max-w-xl gap-8 p-6 md:mx-auto md:max-w-sm md:px-0">
              <div className="grid gap-2">
                <Heading as="h1" className="whitespace-normal">
                  {title}
                </Heading>
                {vendor && (
                  <Text className={'opacity-50 font-medium'}>{vendor}</Text>
                )}
              </div>
              <Suspense
                fallback={
                  <ProductForm
                    variants={[]}
                    cartTotalQuantity={cartTotalQuantity}
                  />
                }
              >
                <Await
                  errorElement="There was a problem loading related products"
                  resolve={variants}
                >
                  {(resp) => (
                    <ProductForm
                      variants={resp.product?.variants.nodes || []}
                      cartTotalQuantity={cartTotalQuantity}
                    />
                  )}
                </Await>
              </Suspense>
              <div className="grid gap-4 py-4">
                {descriptionHtml && (
                  <ProductDetail title="商品説明" content={descriptionHtml} />
                )}
                {shippingPolicy?.body && (
                  <ProductDetailDisclosure
                    title="配送について"
                    content={getExcerpt(shippingPolicy.body)}
                    learnMore={`/policies/${shippingPolicy.handle}`}
                  />
                )}
                {refundPolicy?.body && (
                  <ProductDetailDisclosure
                    title="返品について"
                    content={getExcerpt(refundPolicy.body)}
                    learnMore={`/policies/${refundPolicy.handle}`}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </Section>
      <Suspense fallback={<Skeleton className="h-32" />}>
        <Await
          errorElement="There was a problem loading related products"
          resolve={recommended}
        >
          {(products) => (
            <ProductSwimlane title="Related Products" products={products} />
          )}
        </Await>
      </Suspense>
      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: product.selectedVariant?.price.amount || '0',
              vendor: product.vendor,
              variantId: product.selectedVariant?.id || '',
              variantTitle: product.selectedVariant?.title || '',
              quantity: 1,
            },
          ],
        }}
      />
    </>
  );
}

export function ProductForm({
  variants,
  cartTotalQuantity,
}: {
  variants: ProductVariantFragmentFragment[];
  cartTotalQuantity: number;
}) {
  const {
    product,
    storeDomain,
    sortedDeliverTimeOptions,
    tabiOptionTargets,
    tabiOptionSizes,
  } = useLoaderData<typeof loader>();

  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 7);
  const minDate = currentDate;
  const minDeliveryDate = new Date();
  minDeliveryDate.setDate(minDeliveryDate.getDate() + 3);
  const isEnableBeltOptionMetafield = product.metafields.find(
    (metafield) => metafield?.key === 'is_enable_belt_option',
  );
  const isEnableBeltOption = isEnableBeltOptionMetafield?.value === 'true';
  const isEnableTabiOptionMetafield = product.metafields.find(
    (metafield) => metafield?.key === 'is_enable_tabi_option',
  );
  const isEnableTabiOption = isEnableTabiOptionMetafield?.value === 'true';

  const defaultOptionState = {
    startDate: minDate,
    deliveryDate: minDeliveryDate,
    deliveryTime: sortedDeliverTimeOptions[0],
    beltOption: null,
    tabiTarget: null,
    tabiSize: null,
  };

  const [optionValues, setOptionValues] = useState(defaultOptionState);

  const handleOptionChange = (name: string, value: string | Date) => {
    const state = {...optionValues, [name]: value};

    if (name == 'startDate') {
      state.deliveryDate = subDays(value, 4);
    }

    setOptionValues(state);
  };

  registerLocale('ja', ja);

  const closeRef = useRef<HTMLButtonElement>(null);

  /**
   * Likewise, we're defaulting to the first variant for purposes
   * of add to cart if there is none returned from the loader.
   * A developer can opt out of this, too.
   */
  const selectedVariant = product.selectedVariant!;
  const isOutOfStock = !selectedVariant?.availableForSale;

  const isOnSale =
    selectedVariant?.price?.amount &&
    selectedVariant?.compareAtPrice?.amount &&
    selectedVariant?.price?.amount < selectedVariant?.compareAtPrice?.amount;

  const navigate = useNavigate();

  const attributes = [
    {
      key: '帯の有無',
      value: optionValues.beltOption || '',
    },
    {
      key: '足袋タイプ',
      value: optionValues.tabiTarget || '',
    },
    {
      key: '足袋サイズ',
      value: optionValues.tabiSize || '',
    },
    {
      key: 'レンタル開始日',
      value: optionValues.startDate
        ? optionValues.startDate.toLocaleDateString()
        : '',
    },
    {
      key: '配送日',
      value: optionValues.deliveryDate
        ? optionValues.deliveryDate.toLocaleDateString()
        : '',
    },
    {
      key: '配送時間',
      value: optionValues.deliveryTime || '',
    },
  ].filter((attribute) => attribute.value !== '');

  let isOptionError = false;
  if (
    (isEnableTabiOption &&
      (!optionValues.tabiTarget || !optionValues.tabiSize)) ||
    (isEnableBeltOption && !optionValues.beltOption)
  ) {
    isOptionError = true;
  }

  const isDisableAddToCart = cartTotalQuantity >= 1 || isOptionError;

  return (
    <form className="grid gap-10" encType="multipart/form-data">
      <div className="grid gap-5">
        {!isOutOfStock && (
          <div>
            <div className="grid gap-2">
              {isEnableBeltOption && (
                <div>
                  <Listbox
                    value={optionValues.beltOption}
                    onChange={(selectedOption: string) => {
                      handleOptionChange('beltOption', selectedOption);
                    }}
                  >
                    <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                      帯の有無
                    </Listbox.Label>
                    <div className="relative mt-1">
                      <Listbox.Button className="relative w-full py-2 pl-3 pr-10 text-left bg-white border border-gray-300 rounded-lg shadow-md cursor-default focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                        <span className="block truncate">
                          {optionValues.beltOption || '選択してください'}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                          <IconCaret />
                        </span>
                      </Listbox.Button>
                      <Listbox.Options className="absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                        {['有り', '無し'].map((item) => (
                          <Listbox.Option
                            key={item}
                            value={item}
                            className={({active}) =>
                              clsx(
                                active
                                  ? 'text-primary bg-primary-light'
                                  : 'text-gray-900',
                                'cursor-default select-none relative py-2 pl-10 pr-4',
                              )
                            }
                          >
                            {({selected, active}) => (
                              <>
                                <span
                                  className={clsx(
                                    selected ? 'font-medium' : 'font-normal',
                                    'block truncate',
                                  )}
                                >
                                  {item}
                                </span>
                                {selected ? (
                                  <span
                                    className={clsx(
                                      active
                                        ? 'text-primary'
                                        : 'text-primary-dark',
                                      'absolute inset-y-0 left-0 flex items-center pl-3',
                                    )}
                                  >
                                    <IconCheck />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>
              )}
              {isEnableTabiOption && (
                <div>
                  <div className="grid gap-2">
                    <div>
                      <Listbox>
                        <Listbox
                          value={optionValues.tabiTarget}
                          onChange={(selectedOption: string) => {
                            handleOptionChange('tabiTarget', selectedOption);
                          }}
                        >
                          <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                            足袋
                          </Listbox.Label>
                          <div className="relative mt-1">
                            <Listbox.Button className="relative w-full py-2 pl-3 pr-10 text-left bg-white border border-gray-300 rounded-lg shadow-md cursor-default focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                              <span className="block truncate">
                                {optionValues.tabiTarget || '選択してください'}
                              </span>
                              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                <IconCaret />
                              </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              {tabiOptionTargets.map((item) => (
                                <Listbox.Option
                                  key={item}
                                  value={item}
                                  className={({active}) =>
                                    clsx(
                                      active
                                        ? 'text-primary bg-primary-light'
                                        : 'text-gray-900',
                                      'cursor-default select-none relative py-2 pl-10 pr-4',
                                    )
                                  }
                                >
                                  {({selected, active}) => (
                                    <>
                                      <span
                                        className={clsx(
                                          selected
                                            ? 'font-medium'
                                            : 'font-normal',
                                          'block truncate',
                                        )}
                                      >
                                        {item}
                                      </span>
                                      {selected ? (
                                        <span
                                          className={clsx(
                                            active
                                              ? 'text-primary'
                                              : 'text-primary-dark',
                                            'absolute inset-y-0 left-0 flex items-center pl-3',
                                          )}
                                        >
                                          <IconCheck />
                                        </span>
                                      ) : null}
                                    </>
                                  )}
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </div>
                        </Listbox>
                      </Listbox>
                    </div>
                    {optionValues.tabiTarget &&
                      tabiOptionTargets.includes(optionValues.tabiTarget) && (
                        <div>
                          <Listbox>
                            <Listbox
                              value={optionValues.tabiSize}
                              onChange={(selectedOption: string) => {
                                handleOptionChange('tabiSize', selectedOption);
                              }}
                            >
                              <div className="relative mt-1">
                                <Listbox.Button className="relative w-full py-2 pl-3 pr-10 text-left bg-white border border-gray-300 rounded-lg shadow-md cursor-default focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                                  <span className="block truncate">
                                    {optionValues.tabiSize ||
                                      '選択してください'}
                                  </span>
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <IconCaret />
                                  </span>
                                </Listbox.Button>
                                <Listbox.Options className="absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                  {tabiOptionSizes[optionValues.tabiTarget].map(
                                    (item) => (
                                      <Listbox.Option
                                        key={item}
                                        value={item}
                                        className={({active}) =>
                                          clsx(
                                            active
                                              ? 'text-primary bg-primary-light'
                                              : 'text-gray-900',
                                            'cursor-default select-none relative py-2 pl-10 pr-4',
                                          )
                                        }
                                      >
                                        {({selected, active}) => (
                                          <>
                                            <span
                                              className={clsx(
                                                selected
                                                  ? 'font-medium'
                                                  : 'font-normal',
                                                'block truncate',
                                              )}
                                            >
                                              {item}
                                            </span>
                                            {selected ? (
                                              <span
                                                className={clsx(
                                                  active
                                                    ? 'text-primary'
                                                    : 'text-primary-dark',
                                                  'absolute inset-y-0 left-0 flex items-center pl-3',
                                                )}
                                              >
                                                <IconCheck />
                                              </span>
                                            ) : null}
                                          </>
                                        )}
                                      </Listbox.Option>
                                    ),
                                  )}
                                </Listbox.Options>
                              </div>
                            </Listbox>
                          </Listbox>
                        </div>
                      )}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <div>
                  <Listbox>
                    <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                      ご利用開始日
                    </Listbox.Label>
                    <DatePicker
                      toggleCalendarOnIconClick
                      selected={optionValues.startDate}
                      dateFormat="yyyy/MM/dd"
                      minDate={minDate}
                      locale="ja"
                      onChange={(date) => {
                        if (!date) return;
                        handleOptionChange(
                          'startDate',
                          date?.toLocaleDateString(),
                        );
                      }}
                    />
                  </Listbox>
                </div>
                <div>
                  <Listbox>
                    <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                      到着日
                    </Listbox.Label>
                    {optionValues.deliveryDate.toLocaleDateString()}
                  </Listbox>
                </div>
                <div>
                  <Listbox
                    value={optionValues.deliveryTime}
                    onChange={(selectedOption: string) => {
                      handleOptionChange('deliveryTime', selectedOption);
                    }}
                  >
                    <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                      配送時間
                    </Listbox.Label>
                    <div className="relative mt-1">
                      <Listbox.Button className="relative w-full py-2 pl-3 pr-10 text-left bg-white border border-gray-300 rounded-lg shadow-md cursor-default focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                        <span className="block truncate">
                          {optionValues.deliveryTime}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                          <IconCaret />
                        </span>
                      </Listbox.Button>
                      <Listbox.Options className="absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                        {sortedDeliverTimeOptions.map((item) => (
                          <Listbox.Option
                            key={item}
                            value={item}
                            className={({active}) =>
                              clsx(
                                active
                                  ? 'text-primary bg-primary-light'
                                  : 'text-gray-900',
                                'cursor-default select-none relative py-2 pl-10 pr-4',
                              )
                            }
                          >
                            {({selected, active}) => (
                              <>
                                <span
                                  className={clsx(
                                    selected ? 'font-medium' : 'font-normal',
                                    'block truncate',
                                  )}
                                >
                                  {item}
                                </span>
                                {selected ? (
                                  <span
                                    className={clsx(
                                      active
                                        ? 'text-primary'
                                        : 'text-primary-dark',
                                      'absolute inset-y-0 left-0 flex items-center pl-3',
                                    )}
                                  >
                                    <IconCheck />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>
              </div>
            </div>
          </div>
        )}
        <VariantSelector
          handle={product.handle}
          options={product.options.filter((option) => option.values.length > 1)}
          variants={variants}
        >
          {({option}) => {
            return (
              <div
                key={option.name}
                className="flex flex-col flex-wrap mb-4 gap-y-2 last:mb-0"
              >
                <Heading as="legend" size="lead" className="min-w-[4rem]">
                  {option.name}
                </Heading>

                <div className="flex flex-wrap items-baseline gap-4">
                  {option.values.length > 7 ? (
                    <div className="relative w-full">
                      <Listbox
                        onChange={(selectedOption) => {
                          const value = option.values.find(
                            (v) => v.value === selectedOption,
                          );

                          if (value) {
                            navigate(value.to);
                          }
                        }}
                      >
                        {({open}) => (
                          <>
                            <Listbox.Button
                              ref={closeRef}
                              className={clsx(
                                'flex items-center justify-between w-full py-3 px-4 border border-primary',
                                open
                                  ? 'rounded-b md:rounded-t md:rounded-b-none'
                                  : 'rounded',
                              )}
                            >
                              <span>{option.value}</span>

                              <IconCaret direction={open ? 'up' : 'down'} />
                            </Listbox.Button>
                            <Listbox.Options
                              className={clsx(
                                'border-primary bg-contrast absolute bottom-12 z-30 grid h-48 w-full overflow-y-scroll rounded-t border px-2 py-2 transition-[max-height] duration-150 sm:bottom-auto md:rounded-b md:rounded-t-none md:border-t-0 md:border-b',
                                open ? 'max-h-48' : 'max-h-0',
                              )}
                            >
                              {option.values
                                .filter((value) => value.isAvailable)
                                .map(({value, to, isActive}) => (
                                  <Listbox.Option
                                    key={`option-${option.name}-${value}`}
                                    value={value}
                                  >
                                    {({active}) => (
                                      <Link
                                        to={to}
                                        preventScrollReset
                                        className={clsx(
                                          'text-primary w-full p-2 transition rounded flex justify-start items-center text-left cursor-pointer',
                                          active && 'bg-primary/10',
                                        )}
                                        onClick={() => {
                                          if (!closeRef?.current) return;
                                          closeRef.current.click();
                                        }}
                                      >
                                        {value}
                                        {isActive && (
                                          <span className="ml-2">
                                            <IconCheck />
                                          </span>
                                        )}
                                      </Link>
                                    )}
                                  </Listbox.Option>
                                ))}
                            </Listbox.Options>
                          </>
                        )}
                      </Listbox>
                    </div>
                  ) : (
                    option.values.map(({value, isAvailable, isActive, to}) => (
                      <Link
                        key={option.name + value}
                        to={to}
                        preventScrollReset
                        prefetch="intent"
                        replace
                        className={clsx(
                          'leading-none py-1 border-b-[1.5px] cursor-pointer transition-all duration-200',
                          isActive ? 'border-primary/50' : 'border-primary/0',
                          isAvailable ? 'opacity-100' : 'opacity-50',
                        )}
                      >
                        {value}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          }}
        </VariantSelector>
        {selectedVariant && (
          <div className="grid items-stretch gap-4">
            {isOutOfStock ? (
              <Button variant="secondary" disabled>
                <Text>SOLD OUT</Text>
              </Button>
            ) : (
              <div>
                <AddToCartButton
                  lines={[
                    {
                      merchandiseId: selectedVariant.id!,
                      quantity: 1,
                      attributes,
                    },
                  ]}
                  variant="primary"
                  data-test="add-to-cart"
                  quantity={1}
                  disabled={isDisableAddToCart}
                  className={clsx(
                    'inline-block px-6 py-3 font-medium text-center rounded bg-primary text-contrast',
                    isDisableAddToCart && 'opacity-50',
                  )}
                >
                  <Text
                    as="span"
                    className="flex items-center justify-center gap-2"
                  >
                    <span className="font-bold">カートに追加</span>{' '}
                    <span>·</span>{' '}
                    <Money
                      withoutTrailingZeros
                      data={selectedVariant?.price!}
                      as="span"
                      data-test="price"
                    />
                    {isOnSale && (
                      <Money
                        withoutTrailingZeros
                        data={selectedVariant?.compareAtPrice!}
                        as="span"
                        className="opacity-50 strike"
                      />
                    )}
                  </Text>
                </AddToCartButton>
                {isDisableAddToCart && (
                  <>
                    {isOptionError && (
                      <p className="mt-2 text-sm text-center text-red-500">
                        ※ 選択されていない項目があります
                      </p>
                    )}
                    {cartTotalQuantity >= 1 && (
                      <p className="mt-2 text-sm text-center text-red-500">
                        ※ カートに商品が入っているため追加できません
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function ProductDetail({
  title,
  content,
  learnMore,
}: {
  title: string;
  content: string;
  learnMore?: string;
}) {
  return (
    <div key={title} className="grid w-full gap-2">
      <div className="text-left">
        <div className="flex justify-between">
          <Text size="lead" as="h4">
            {title}
          </Text>
        </div>
      </div>

      <div className={'pb-4 pt-2 grid gap-2'}>
        <div
          className="prose dark:prose-invert"
          dangerouslySetInnerHTML={{__html: content}}
        />
        {learnMore && (
          <div className="">
            <Link
              className="pb-px border-b border-primary/30 text-primary/50"
              to={learnMore}
            >
              Learn more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductDetailDisclosure({
  title,
  content,
  learnMore,
}: {
  title: string;
  content: string;
  learnMore?: string;
}) {
  return (
    <Disclosure key={title} as="div" className="grid w-full gap-2">
      {({open}) => (
        <>
          <Disclosure.Button className="text-left">
            <div className="flex justify-between">
              <Text size="lead" as="h4">
                {title}
              </Text>
              <IconClose
                className={clsx(
                  'transition-transform transform-gpu duration-200',
                  !open && 'rotate-[45deg]',
                )}
              />
            </div>
          </Disclosure.Button>

          <Disclosure.Panel className={'pb-4 pt-2 grid gap-2'}>
            <div
              className="prose dark:prose-invert"
              dangerouslySetInnerHTML={{__html: content}}
            />
            {learnMore && (
              <div className="">
                <Link
                  className="pb-px border-b border-primary/30 text-primary/50"
                  to={learnMore}
                >
                  Learn more
                </Link>
              </div>
            )}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariantFragment on ProductVariant {
    id
    availableForSale
    selectedOptions {
      name
      value
    }
    image {
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    compareAtPrice {
      amount
      currencyCode
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
  }
`;

const METAFIELD_FRAGMENT = `#graphql
  fragment Metafield on Metafield {
    id
    key
    value
  }
`;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $language: LanguageCode
    $handle: String!
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      vendor
      handle
      descriptionHtml
      description
      options {
        name
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
        ...ProductVariantFragment
      }
      media(first: 7) {
        nodes {
          ...Media
        }
      }
      variants(first: 1) {
        nodes {
          ...ProductVariantFragment
        }
      }
      seo {
        description
        title
      }
      metafields(identifiers: [{namespace: "custom", key: "is_enable_belt_option"}, {namespace: "custom", key: "is_enable_tabi_option"}]) {
      ...Metafield
      }
      tags
    }
    shop {
      name
      primaryDomain {
        url
      }
      shippingPolicy {
        body
        handle
      }
      refundPolicy {
        body
        handle
      }
    }
  }
  ${MEDIA_FRAGMENT}
  ${PRODUCT_VARIANT_FRAGMENT}
  ${METAFIELD_FRAGMENT}
` as const;

const VARIANTS_QUERY = `#graphql
  query variants(
    $country: CountryCode
    $language: LanguageCode
    $handle: String!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      variants(first: 250) {
        nodes {
          ...ProductVariantFragment
        }
      }
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  query productRecommendations(
    $productId: ID!
    $count: Int
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    recommended: productRecommendations(productId: $productId) {
      ...ProductCard
    }
    additional: products(first: $count, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;

async function getRecommendedProducts(
  storefront: Storefront,
  productId: string,
) {
  const products = await storefront.query(RECOMMENDED_PRODUCTS_QUERY, {
    variables: {productId, count: 12},
  });

  invariant(products, 'No data returned from Shopify API');

  const mergedProducts = (products.recommended ?? [])
    .concat(products.additional.nodes)
    .filter(
      (value, index, array) =>
        array.findIndex((value2) => value2.id === value.id) === index,
    );

  const originalProduct = mergedProducts.findIndex(
    (item) => item.id === productId,
  );

  mergedProducts.splice(originalProduct, 1);

  return {nodes: mergedProducts};
}

const DELIVERY_TIME_OPTIONS_QUERY = `#graphql
query DeliverTimeOptions {
  metaobjects(type: "sagawa_delivery_time_classifications", first: 100) {
    nodes {
      fields {
        key
        value
      }
    }
  }
}
` as const;

const TABI_OPTIONS_QUERY = `#graphql
query TabiOptions {
  metaobjects(type: "tabi_option", first: 3) {
    nodes {
      fields {
        key
        value
      }
    }
  }
}
` as const;
