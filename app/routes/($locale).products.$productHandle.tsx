import type {ChangeEvent} from 'react';
import {useRef, Suspense, useState, useEffect} from 'react';
import ReactDOM from 'react-dom';
import {Disclosure, Listbox} from '@headlessui/react';
import {defer, redirect} from '@shopify/remix-oxygen';
import type {
  SerializeFrom,
  MetaArgs,
  LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {useLoaderData, Await, useNavigate, useLocation} from '@remix-run/react';
import {
  getSeoMeta,
  Money,
  VariantSelector,
  getSelectedProductOptions,
  Analytics,
  ShopPayButton,
} from '@shopify/hydrogen';
import invariant from 'tiny-invariant';
import clsx from 'clsx';
import DatePicker, {registerLocale} from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {addDays, format, eachDayOfInterval} from 'date-fns';
import {ja} from 'date-fns/locale/ja';
import type {
  AttributeInput,
  CartLineInput,
  ProductOption,
  SelectedOption,
} from '@shopify/hydrogen/storefront-api-types';
import Hashids from 'hashids';

import type {
  MetafieldFragment,
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
import {pushRecentlyViewedProductId} from '~/lib/recently-viewed-products';
import {Modal} from '~/components/Modal';
import {RecentlyViewedSwimlane} from '~/components/RecentlyViewedSwimlane';

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

  const isEnableBeltOption =
    product.metafields.find(
      (metafield: MetafieldFragment) =>
        metafield?.key === 'is_enable_belt_option',
    )?.value === 'true';

  // 振袖・袴フラグと不可日は別クエリで取得（PRODUCT_QUERY の型生成を壊さないため）
  const [rentalMetafieldsResult, beltResult] = await Promise.all([
    context.storefront.query(PRODUCT_RENTAL_METAFIELDS_QUERY, {
      variables: {handle: productHandle},
    }),
    isEnableBeltOption ? getBeltOptions(context.storefront) : null,
  ]);

  const belts: BeltOption[] | null = beltResult ?? null;

  const rentalMetafields: Array<{key: string; value: string} | null> =
    (rentalMetafieldsResult as any)?.product?.metafields ?? [];
  const isRental =
    rentalMetafields.find((m) => m?.key === 'is_rental')?.value === 'true';
  const isFurisode =
    rentalMetafields.find((m) => m?.key === 'is_furisode')?.value === 'true';
  const isHakama =
    rentalMetafields.find((m) => m?.key === 'is_hakama')?.value === 'true';
  const unavailableDatesRaw = rentalMetafields.find(
    (m) => m?.key === 'unavailable_dates',
  )?.value;
  const unavailableDates: string[] = unavailableDatesRaw
    ? (JSON.parse(unavailableDatesRaw) as string[])
    : [];

  let anshinPack: RentalOptionProduct | null = null;
  let shishuHaneri: RentalOptionProduct | null = null;

  const isEnableAnshinPack = product.tags.some((tag: string) =>
    tag.includes('安心パック'),
  );

  if (isRental) {
    const rentalOptionsResult = await context.storefront.query(
      RENTAL_OPTIONS_QUERY,
    );
    if (isEnableAnshinPack) {
      const apNode = (rentalOptionsResult as any)?.anshinPack?.nodes?.[0];
      const apVariant = apNode?.variants?.nodes?.[0];
      if (apVariant) {
        anshinPack = {
          variantId: apVariant.id,
          price: apVariant.availableForSale
            ? apVariant.price
            : {amount: '1100', currencyCode: 'JPY'},
          title: apNode.title,
          availableForSale: apVariant.availableForSale ?? true,
        };
      }
    }
    // 刺繍半衿は振袖・袴のみ
    if (isFurisode || isHakama) {
      const shNode = (rentalOptionsResult as any)?.shishuHaneri?.nodes?.[0];
      const shVariant = shNode?.variants?.nodes?.[0];
      if (shVariant) {
        shishuHaneri = {
          variantId: shVariant.id,
          price: shVariant.availableForSale
            ? shVariant.price
            : {amount: '2000', currencyCode: 'JPY'},
          title: shNode.title,
          availableForSale: shVariant.availableForSale ?? true,
        };
      }
    }
  }

  const recommended = getRecommendedProducts(context.storefront, product.id);

  // TODO: firstVariant is never used because we will always have a selectedVariant due to redirect
  // Investigate if we can avoid the redirect for product pages with no search params for first variant
  const firstVariant = product.variants.nodes[0];
  const selectedVariant = product.selectedVariant ?? firstVariant;

  // MEMO: variantが設定されていない場合、URLパラメーターに追加せずにデフォルトのvariantを選択済みにする
  const firstVariantIsDefault = Boolean(
    firstVariant.selectedOptions.find(
      (option: SelectedOption) =>
        option.name === 'Title' && option.value === 'Default Title',
    ),
  );

  if (firstVariantIsDefault) {
    product.selectedVariant = firstVariant;
  } else {
    if (!product.selectedVariant) {
      throw redirectToFirstVariant({product, request});
    }
  }

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
    isEnableBeltOption,
    belts,
    isRental,
    isFurisode,
    isHakama,
    unavailableDates,
    anshinPack,
    shishuHaneri,
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

  useEffect(() => {
    pushRecentlyViewedProductId(product.id);
  }, [product.id]);

  return (
    <div className="bg-white">
      <Section className="px-0 mx-auto w-full md:px-8 lg:px-12 md:max-w-245">
        <div className="grid items-start mt-9 md:gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-2">
          <ProductGallery media={media.nodes} className="w-full min-w-0" />
          <div className="min-w-0">
            <section className="flex flex-col gap-8 p-6 w-full sm:pt-0 md:mx-auto md:px-0">
              <div className="grid gap-2">
                {vendor && (
                  <Text className={'text-sm font-medium opacity-50'}>
                    {vendor}
                  </Text>
                )}
                <p className="text-xs text-gray-400">{product.handle}</p>
                <Heading as="h1" className="text-xl! whitespace-normal">
                  {title}
                </Heading>
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
      <div className="bg-[#fafaf9] mt-12 md:mt-20">
        <Section padding="x" className="!px-0 mx-auto max-w-245">
          <Suspense fallback={<Skeleton className="h-32" />}>
            <Await
              errorElement="There was a problem loading related products"
              resolve={recommended}
            >
              {(products) => (
                <ProductSwimlane title="おすすめ商品" products={products} />
              )}
            </Await>
          </Suspense>
          <RecentlyViewedSwimlane />
        </Section>
      </div>
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
    </div>
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
    tabiOptionTargets,
    tabiOptionSizes,
    isEnableBeltOption,
    belts,
    isRental,
    isFurisode,
    isHakama,
    unavailableDates,
    anshinPack,
    shishuHaneri,
  } = useLoaderData<typeof loader>();

  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 13);
  const minDate = currentDate;
  const isEnableTabiOptionMetafield = product.metafields.find(
    (metafield: MetafieldFragment) =>
      metafield?.key === 'is_enable_tabi_option',
  );
  const isEnableTabiOption = isEnableTabiOptionMetafield?.value === 'true';

  const defaultOptionState = {
    startDate: minDate,
    beltOption: null,
    tabiTarget: null as string | null,
    tabiSize: null as string | null,
  };

  const [optionValues, setOptionValues] = useState(defaultOptionState);
  const [selectedBelts, setSelectedBelts] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnshinPack, setSelectedAnshinPack] = useState(false);
  const [selectedShishuHaneri, setSelectedShishuHaneri] = useState(false);
  const [zooriSize, setZooriSize] = useState<string | null>(null);
  const [hakamaSize, setHakamaSize] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState(false);

  const handleOptionChange = (name: string, value: string | Date) => {
    setOptionValues({...optionValues, [name]: value});
  };

  const handleBeltChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (selectedBelts.includes(value)) {
      setSelectedBelts(selectedBelts.filter((belt) => belt !== value));
    } else {
      setSelectedBelts([...selectedBelts, value]);
    }
  };

  registerLocale('ja', ja);

  const getRentalNights = (title: string): number => {
    if (title.includes('1月')) return 5;
    if (title.includes('下見')) return 1;
    return 3;
  };

  const selectedVariantTitle = product.selectedVariant?.title ?? '';
  const rentalNights = getRentalNights(selectedVariantTitle);
  const returnDate = addDays(optionValues.startDate, rentalNights);

  const unavailableDateObjects = unavailableDates.map((d) => new Date(d));

  const checkRangeHasUnavailable = (start: Date, end: Date): boolean => {
    const days = eachDayOfInterval({start, end});
    return days.some((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      return unavailableDates.includes(dayStr);
    });
  };

  const handleStartDateChange = (date: Date | null) => {
    if (!date) return;
    const isJanuary = date.getMonth() === 0;
    if (isFurisode) {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set(
        'レンタル期間',
        isJanuary ? '1月利用（5泊6日）' : '2-12月利用（3泊4日）',
      );
      navigate(`${location.pathname}?${searchParams.toString()}`, {
        replace: true,
        preventScrollReset: true,
      });
    }
    const nights =
      isJanuary && isFurisode ? 5 : getRentalNights(selectedVariantTitle);
    const end = addDays(date, nights);
    setRangeError(checkRangeHasUnavailable(date, end));
    setOptionValues({...optionValues, startDate: date});
  };

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
  const location = useLocation();

  const attributes: AttributeInput[] = [
    {
      key: '帯',
      value:
        belts && selectedBelts.length > 0
          ? selectedBelts
              .map((belt) => belts.find((b) => b.id === belt)?.title)
              .join(', ')
          : '',
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
        ? format(optionValues.startDate, 'yyyy/MM/dd')
        : '',
    },
    {
      key: '返却日',
      value: format(returnDate, 'yyyy/MM/dd'),
    },
    {
      key: '草履サイズ',
      value: zooriSize || '',
    },
    {
      key: '袴サイズ',
      value: hakamaSize || '',
    },
    {
      key: '安心パック',
      value: selectedAnshinPack ? 'あり' : '',
    },
    {
      key: '刺繍半衿',
      value: selectedShishuHaneri ? 'あり' : '',
    },
    {
      key: '連携ID',
      value:
        belts && selectedBelts.length > 0
          ? selectedBelts
              .map((belt) => belts.find((b) => b.id === belt)?.hashId)
              .join(',')
          : '',
    },
  ].filter((attribute) => attribute.value !== '');

  let isOptionError = false;
  if (
    (isEnableTabiOption &&
      (!optionValues.tabiTarget || !optionValues.tabiSize)) ||
    (isEnableBeltOption && selectedBelts.length === 0) ||
    (isRental && !zooriSize) ||
    (isHakama && !hakamaSize) ||
    rangeError
  ) {
    isOptionError = true;
  }

  const isDisableAddToCart = cartTotalQuantity >= 1 || isOptionError;

  const anshinPackPrice = anshinPack
    ? parseFloat(anshinPack.price.amount)
    : 1100;
  const shishuHaneriPrice = shishuHaneri
    ? parseFloat(shishuHaneri.price.amount)
    : 2000;
  const mainPrice = parseFloat(selectedVariant?.price?.amount ?? '0');
  const totalPrice =
    mainPrice +
    (selectedAnshinPack ? anshinPackPrice : 0) +
    (selectedShishuHaneri ? shishuHaneriPrice : 0);

  const lines: CartLineInput[] = [
    {
      merchandiseId: selectedVariant.id!,
      quantity: 1,
      attributes,
    },
  ];

  if (selectedAnshinPack && anshinPack) {
    lines.push({
      merchandiseId: anshinPack.variantId,
      quantity: 1,
      attributes: [{key: '種別', value: '安心パック'}],
    });
  }

  if (selectedShishuHaneri && shishuHaneri) {
    lines.push({
      merchandiseId: shishuHaneri.variantId,
      quantity: 1,
      attributes: [{key: '種別', value: '刺繍半衿オプション'}],
    });
  }

  if (isEnableBeltOption && selectedBelts.length > 0) {
    selectedBelts.forEach((selectedBelt) => {
      lines.unshift({
        merchandiseId: selectedBelt,
        quantity: 1,
        attributes: [
          {
            key: '連携ID',
            value:
              belts?.find((belt) => belt.id === selectedBelt)?.hashId || '',
          },
        ],
      });
    });
  }

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsModalOpen(true);
  };
  const closeModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
  };

  return (
    <form className="grid gap-10" encType="multipart/form-data">
      <div className="grid gap-5">
        {/* 料金表示 */}
        {isFurisode && variants.length > 1 ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium text-gray-600">料金一覧</p>
            <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex justify-between items-center px-3 py-2 text-sm"
                >
                  <span className="text-gray-700">{variant.title}</span>
                  <div className="flex items-baseline gap-0.5">
                    <Money
                      withoutTrailingZeros
                      data={variant.price}
                      as="span"
                      className="font-semibold"
                    />
                    <span className="text-[10px] text-gray-500">税込</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-1 items-end">
            <Money
              withoutTrailingZeros
              data={selectedVariant?.price!}
              as="span"
              data-test="price"
              className="inline-block text-2xl font-bold leading-none"
            />
            <span className="inline-block text-[10px]">税込</span>
          </div>
        )}
        {isOnSale && (
          <Money
            withoutTrailingZeros
            data={selectedVariant?.compareAtPrice!}
            as="span"
            className="opacity-50 strike"
          />
        )}
        {!isOutOfStock && isRental && (
          <div>
            <div className="grid gap-4">
              {/* 利用開始日・返却日 */}
              <div className="grid gap-2">
                <div>
                  <p className="block mb-1 text-sm font-medium text-gray-900">
                    ご利用日（レンタル開始日）
                  </p>
                  <DatePicker
                    toggleCalendarOnIconClick
                    selected={optionValues.startDate}
                    startDate={optionValues.startDate}
                    endDate={returnDate}
                    dateFormat="yyyy/MM/dd"
                    minDate={minDate}
                    locale="ja"
                    excludeDates={unavailableDateObjects}
                    onChange={handleStartDateChange}
                    className="px-3 py-2 w-full text-sm rounded-lg border border-gray-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="flex justify-between px-1 text-sm text-gray-600">
                  <span>
                    返却日：
                    <span className="font-medium text-gray-900">
                      {format(returnDate, 'yyyy/MM/dd')}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">
                    {rentalNights}泊{rentalNights + 1}日
                  </span>
                </div>
                {rangeError && (
                  <p className="text-sm text-red-500">
                    ※
                    選択した期間にレンタル不可日が含まれています。別の日程を選択してください。
                  </p>
                )}
              </div>

              {/* レンタルオプション */}
              {isRental && (
                <div className="grid gap-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">
                    オプション
                  </p>

                  {/* 安心パック */}
                  {anshinPack && (
                    <label className="flex gap-2 items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAnshinPack}
                        onChange={(e) =>
                          setSelectedAnshinPack(e.target.checked)
                        }
                        className="rounded border-gray-300 size-4 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">
                        基本安心パック（＋¥
                        {Math.round(anshinPackPrice).toLocaleString()}）
                      </span>
                    </label>
                  )}

                  {/* 草履サイズ */}
                  <div>
                    <Listbox
                      value={zooriSize}
                      onChange={(v: string) => setZooriSize(v)}
                    >
                      <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                        草履サイズ
                        <span className="ml-1 text-red-500">*</span>
                      </Listbox.Label>
                      <div className="relative mt-1">
                        <Listbox.Button className="relative py-2 pr-10 pl-3 w-full text-left bg-white rounded-lg border border-gray-300 shadow-md cursor-default focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                          <span className="block truncate">
                            {zooriSize || '選択してください'}
                          </span>
                          <span className="flex absolute inset-y-0 right-0 items-center pr-2 pointer-events-none">
                            <IconCaret />
                          </span>
                        </Listbox.Button>
                        <Listbox.Options className="overflow-auto absolute z-10 py-1 mt-1 w-full max-h-60 text-base bg-white rounded-md ring-1 ring-black ring-opacity-5 shadow-lg focus:outline-hidden sm:text-sm">
                          {['M', 'L', 'LL'].map((size) => (
                            <Listbox.Option
                              key={size}
                              value={size}
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
                                    {size}
                                  </span>
                                  {selected ? (
                                    <span
                                      className={clsx(
                                        active
                                          ? 'text-primary'
                                          : 'text-primary-dark',
                                        'flex absolute inset-y-0 left-0 items-center pl-3',
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

                  {/* 刺繍半衿 */}
                  {shishuHaneri && (
                    <label className="flex gap-2 items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedShishuHaneri}
                        onChange={(e) =>
                          setSelectedShishuHaneri(e.target.checked)
                        }
                        className="rounded border-gray-300 size-4 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">
                        刺繍半衿付きに変更（＋¥
                        {Math.round(shishuHaneriPrice).toLocaleString()}）
                      </span>
                    </label>
                  )}

                  {/* 袴サイズ（袴のみ） */}
                  {isHakama && (
                    <div>
                      <Listbox
                        value={hakamaSize}
                        onChange={(v: string) => setHakamaSize(v)}
                      >
                        <Listbox.Label className="block mb-1 text-sm font-medium text-gray-900">
                          袴サイズ
                          <span className="ml-1 text-red-500">*</span>
                        </Listbox.Label>
                        <div className="relative mt-1">
                          <Listbox.Button className="relative py-2 pr-10 pl-3 w-full text-left bg-white rounded-lg border border-gray-300 shadow-md cursor-default focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                            <span className="block truncate">
                              {hakamaSize || '選択してください'}
                            </span>
                            <span className="flex absolute inset-y-0 right-0 items-center pr-2 pointer-events-none">
                              <IconCaret />
                            </span>
                          </Listbox.Button>
                          <Listbox.Options className="overflow-auto absolute z-10 py-1 mt-1 w-full max-h-60 text-base bg-white rounded-md ring-1 ring-black ring-opacity-5 shadow-lg focus:outline-hidden sm:text-sm">
                            {['S', 'M', 'L', 'LL'].map((size) => (
                              <Listbox.Option
                                key={size}
                                value={size}
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
                                      {size}
                                    </span>
                                    {selected ? (
                                      <span
                                        className={clsx(
                                          active
                                            ? 'text-primary'
                                            : 'text-primary-dark',
                                          'flex absolute inset-y-0 left-0 items-center pl-3',
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
                </div>
              )}

              {/* 帯オプション */}
              {isEnableBeltOption && belts && (
                <div>
                  <p className="block mb-1 text-sm font-medium text-gray-900">
                    帯
                  </p>
                  <button
                    onClick={openModal}
                    className="relative py-2 pr-10 pl-3 w-full text-left bg-white rounded-lg border border-gray-300 shadow-md cursor-default focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                  >
                    <span className="block truncate">
                      {selectedBelts.length > 0
                        ? selectedBelts
                            .map(
                              (belt) => belts.find((b) => b.id === belt)?.title,
                            )
                            .join(', ')
                        : '選択してください'}
                    </span>
                    <span className="flex absolute inset-y-0 right-0 items-center pr-2 pointer-events-none">
                      <IconCaret />
                    </span>
                  </button>

                  {isModalOpen && (
                    <BeltOptionModal
                      closeModalHandle={closeModal}
                      belts={belts}
                      selectedBelts={selectedBelts}
                      selectBeltHandle={handleBeltChange}
                    />
                  )}
                </div>
              )}

              {/* 足袋オプション */}
              {isEnableTabiOption && (
                <div className="grid gap-2">
                  <div>
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
                        <Listbox.Button className="relative py-2 pr-10 pl-3 w-full text-left bg-white rounded-lg border border-gray-300 shadow-md cursor-default focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                          <span className="block truncate">
                            {optionValues.tabiTarget || '選択してください'}
                          </span>
                          <span className="flex absolute inset-y-0 right-0 items-center pr-2 pointer-events-none">
                            <IconCaret />
                          </span>
                        </Listbox.Button>
                        <Listbox.Options className="overflow-auto absolute z-10 py-1 mt-1 w-full max-h-60 text-base bg-white rounded-md ring-1 ring-black ring-opacity-5 shadow-lg focus:outline-hidden sm:text-sm">
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
                                        'flex absolute inset-y-0 left-0 items-center pl-3',
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
                  {optionValues.tabiTarget &&
                    tabiOptionTargets.includes(optionValues.tabiTarget) && (
                      <div>
                        <Listbox
                          value={optionValues.tabiSize}
                          onChange={(selectedOption: string) => {
                            handleOptionChange('tabiSize', selectedOption);
                          }}
                        >
                          <div className="relative mt-1">
                            <Listbox.Button className="relative py-2 pr-10 pl-3 w-full text-left bg-white rounded-lg border border-gray-300 shadow-md cursor-default focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm">
                              <span className="block truncate">
                                {optionValues.tabiSize || '選択してください'}
                              </span>
                              <span className="flex absolute inset-y-0 right-0 items-center pr-2 pointer-events-none">
                                <IconCaret />
                              </span>
                            </Listbox.Button>
                            <Listbox.Options className="overflow-auto absolute z-10 py-1 mt-1 w-full max-h-60 text-base bg-white rounded-md ring-1 ring-black ring-opacity-5 shadow-lg focus:outline-hidden sm:text-sm">
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
                                              'flex absolute inset-y-0 left-0 items-center pl-3',
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
                      </div>
                    )}
                </div>
              )}

              {/* 合計金額 */}
              {(selectedAnshinPack || selectedShishuHaneri) && (
                <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-700">
                    合計（税込）
                  </span>
                  <span className="text-xl font-bold">
                    ¥{Math.round(totalPrice).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        <VariantSelector
          handle={product.handle}
          options={product.options.filter(
            (option: ProductOption) => option.values.length > 1,
          )}
          variants={variants}
        >
          {({option}) => {
            return (
              <div
                key={option.name}
                className="flex flex-col flex-wrap gap-y-2 mb-4 last:mb-0"
              >
                <Heading as="legend" size="lead" className="text-sm min-w-16">
                  {option.name}
                </Heading>

                <div className="flex flex-wrap gap-4 items-baseline">
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
                                'flex justify-between items-center px-4 py-3 w-full border border-primary',
                                open
                                  ? 'rounded-b md:rounded-t md:rounded-b-none'
                                  : 'rounded-sm',
                              )}
                            >
                              <span>{option.value}</span>

                              <IconCaret direction={open ? 'up' : 'down'} />
                            </Listbox.Button>
                            <Listbox.Options
                              className={clsx(
                                'grid overflow-y-scroll absolute bottom-12 z-30 px-2 py-2 w-full h-48 rounded-t border duration-150 border-primary bg-contrast transition-[max-height] sm:bottom-auto md:rounded-b md:rounded-t-none md:border-t-0 md:border-b',
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
                                          'text-primary w-full p-2 transition rounded-sm flex justify-start items-center text-left cursor-pointer',
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
                    option.values.map(({value, isAvailable, isActive, to}) => {
                      const isJanuarySelected =
                        isFurisode &&
                        option.name === 'レンタル期間' &&
                        optionValues.startDate?.getMonth() === 0;
                      const isLockedOut =
                        isJanuarySelected && !value.includes('1月');
                      return isLockedOut ? (
                        <span
                          key={option.name + value}
                          className="p-3 text-sm leading-none rounded-sm opacity-30 cursor-not-allowed border-primary/0"
                        >
                          {value}
                        </span>
                      ) : (
                        <Link
                          key={option.name + value}
                          to={to}
                          preventScrollReset
                          prefetch="intent"
                          replace
                          className={clsx(
                            'p-3 text-sm leading-none rounded-sm transition-all duration-200 cursor-pointer',
                            isActive
                              ? 'text-white border-primary/50 bg-primary/90'
                              : 'border-primary/0',
                            isAvailable ? 'opacity-100' : 'opacity-50',
                          )}
                        >
                          {value}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          }}
        </VariantSelector>
        {selectedVariant && (
          <div className="grid gap-4 items-stretch">
            {isOutOfStock ? (
              <Button variant="secondary" disabled>
                <Text>SOLD OUT</Text>
              </Button>
            ) : (
              <div>
                <AddToCartButton
                  lines={lines}
                  variant="primary"
                  data-test="add-to-cart"
                  quantity={1}
                  disabled={isDisableAddToCart}
                  className={clsx(
                    'inline-block px-6 py-3 font-medium text-center rounded-sm bg-[#643e84] text-contrast',
                    isDisableAddToCart && 'opacity-50',
                  )}
                >
                  <Text
                    as="span"
                    className="flex gap-2 justify-center items-center"
                  >
                    <span className="font-bold">カートに追加</span>{' '}
                  </Text>
                </AddToCartButton>
                {isDisableAddToCart && (
                  <>
                    {isOptionError && (
                      <p className="mt-2 text-sm text-center text-red-500">
                        ※ 選択されていない項目があります
                      </p>
                    )}
                    {/* {cartTotalQuantity >= 1 && (
                      <p className="mt-2 text-sm text-center text-red-500">
                        ※ カートに商品が入っているため追加できません
                      </p>
                    )} */}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {!isOutOfStock && (
          <div className="">
            <ShopPayButton
              width="100%"
              variantIds={[selectedVariant?.id!]}
              storeDomain={storeDomain}
            />
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
    <div key={title} className="grid gap-2 w-full">
      <div className="text-left sr-only">
        <div className="flex justify-between">
          <Text size="lead" as="h4">
            {title}
          </Text>
        </div>
      </div>

      <div className={'grid gap-2 pt-2 pb-4'}>
        <div
          className="text-sm prose"
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
    <Disclosure key={title} as="div" className="grid gap-2 w-full">
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
                  !open && 'rotate-45',
                )}
              />
            </div>
          </Disclosure.Button>

          <Disclosure.Panel className={'grid gap-2 pt-2 pb-4'}>
            <div
              className="prose"
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

function BeltOptionModal({
  closeModalHandle,
  belts,
  selectedBelts,
  selectBeltHandle,
}: {
  closeModalHandle: (e: React.MouseEvent) => void;
  belts: SerializedIdBeltOption[];
  selectedBelts: string[];
  selectBeltHandle: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return ReactDOM.createPortal(
    <div className="flex overflow-hidden fixed inset-0 z-50 justify-center items-center">
      {/* 背景 */}
      <div className="fixed inset-0 transition-opacity">
        <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
      </div>

      <div className="text-left transition-all transform bg-white rounded-lg shadow-xl sm:max-w-2xl sm:w-full w-[calc(100%-0.625rem)] sm:h-auto max-h-[80vh] ">
        <p className="fixed top-0 p-6 w-full text-lg font-medium leading-6 text-gray-900 bg-white">
          帯選択
        </p>
        <div className="bg-white px-6 py-20 max-h-[80vh] overflow-hidden overflow-y-scroll">
          <div className="">
            <div className="grid sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-5 overflow-scroll">
              {belts.map((belt) => (
                <label
                  className={clsx(
                    belt.availableForSale
                      ? 'cursor-pointer'
                      : 'cursor-not-allowed opacity-65',
                  )}
                  key={belt.id}
                >
                  <img src={belt.src} alt={belt.title} />
                  <div className="flex gap-x-1 items-center my-2 ml-1 text-sm">
                    <input
                      type="checkbox"
                      value={belt.id}
                      onChange={selectBeltHandle}
                      className="block text-black bg-white border rounded-sm group size-4 ring-black! "
                      disabled={!belt.availableForSale}
                      checked={selectedBelts.includes(belt.id)}
                    />
                    {belt.title}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 px-4 py-3 w-full bg-gray-50 sm:px-6 sm:flex sm:flex-row-reverse">
          <Button onClick={closeModalHandle}>決定</Button>
        </div>
      </div>
    </div>,
    document.querySelector('#modal') as Element,
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
      media(first: 50) {
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
    additional: products(first: $count, sortKey: BEST_SELLING, query: "-tag:帯 AND -tag:オプション") {
      nodes {
        ...ProductCard
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;

type BeltOption = {
  id: string;
  title: string;
  src: string | undefined;
  hashId: string;
  availableForSale: boolean;
};
type SerializedIdBeltOption = SerializeFrom<BeltOption>;

async function getBeltOptions(storefront: Storefront) {
  const result = await storefront.query(BELT_OPTIONS_QUERY);

  invariant(result, 'No data returned from Shopify API');

  const belts: BeltOption[] = result.products.nodes.map((product) => {
    return {
      id: product.variants.nodes[0].id,
      title: product.title,
      src: product.variants.nodes[0].image?.src,
      hashId: new Hashids(product.title).encode(1, 2, 3),
      availableForSale: product.variants.nodes[0].availableForSale,
    };
  });

  return belts;
}

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

const BELT_OPTIONS_QUERY = `#graphql
query getProducts {
  products(first: 100, query: "(tag:帯) AND (tag:オプション)") {
    nodes {
      id
      title
      variants(first: 1) {
        nodes {
          id
          image {
            src
          }
          availableForSale
        }
      }
    }
  }
}
` as const;

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

const PRODUCT_RENTAL_METAFIELDS_QUERY = `#graphql
  query ProductRentalMetafields($handle: String!) {
    product(handle: $handle) {
      metafields(identifiers: [
        {namespace: "custom", key: "is_rental"},
        {namespace: "custom", key: "is_furisode"},
        {namespace: "custom", key: "is_hakama"},
        {namespace: "custom", key: "unavailable_dates"}
      ]) {
        key
        value
      }
    }
  }
` as const;

const RENTAL_OPTIONS_QUERY = `#graphql
query RentalOptions {
  anshinPack: products(first: 1, query: "tag:安心パック") {
    nodes {
      title
      variants(first: 1) {
        nodes {
          id
          availableForSale
          price {
            amount
            currencyCode
          }
        }
      }
    }
  }
  shishuHaneri: products(first: 1, query: "tag:刺繍半衿") {
    nodes {
      title
      variants(first: 1) {
        nodes {
          id
          availableForSale
          price {
            amount
            currencyCode
          }
        }
      }
    }
  }
}
` as const;

type RentalOptionProduct = {
  variantId: string;
  price: {amount: string; currencyCode: string};
  title: string;
  availableForSale: boolean;
};
