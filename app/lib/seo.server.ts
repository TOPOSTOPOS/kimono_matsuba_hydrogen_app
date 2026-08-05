import {type SeoConfig} from '@shopify/hydrogen';
import type {
  Article,
  Blog,
  Collection,
  Page,
  Product,
  ProductVariant,
  ShopPolicy,
  Image,
} from '@shopify/hydrogen/storefront-api-types';
import type {
  Article as SeoArticle,
  BreadcrumbList,
  Blog as SeoBlog,
  CollectionPage,
  Offer,
  Organization,
  Product as SeoProduct,
  WebPage,
} from 'schema-dts';

import type {ShopFragment} from 'storefrontapi.generated';

/** サイト名の最終フォールバック（Shopifyの店名が取得できない場合のみ使用） */
const BRAND = '本きもの松葉';
/** タイトル未設定時に使う規定タイトル（トップページもこれ） */
const DEFAULT_TITLE =
  '成人式の振袖レンタル・ママ振・ご購入は、衣装点数が大阪最大級の本きもの松葉';
/** 説明文未設定時に使う規定ディスクリプション */
const DEFAULT_DESCRIPTION =
  '本きもの松葉は、着物・一般呉服の販売・成人式の振袖レンタル・ママ振や販売を行っています。大阪最大級の衣装点数があり、1948年の創業以来たくさんお客様のお手伝いをしてきた実績があります。大阪市・堺市などでたくさんのお客様にご愛顧頂いております。';

/**
 * 下層ページのタイトルを組み立てる。
 * 個別タイトルがあればそれを返し、接尾辞（「| 店名」）は root の titleTemplate が付与する。
 * 個別タイトルが無ければ空にして、root のタイトル（＝スローガン／規定タイトル）に委ねる。
 */
function buildTitle(specificTitle?: string | null): {
  title: string;
} {
  return {title: specificTitle || ''};
}

/**
 * サイト共通のサイト名/タイトル/説明/OG画像。
 * Shopify管理画面の設定を優先し、未設定ならコードの規定値を使う。
 * - サイト名 : shop.name（設定 → 一般 のストア名）→ BRAND
 * - タイトル : brand.slogan（設定 → ブランド のスローガン）→ DEFAULT_TITLE
 * - 説明     : brand.shortDescription（簡単な説明）→ shop.description → DEFAULT_DESCRIPTION
 * - OG画像   : brand.coverImage（カバー画像）→ brand.logo（ロゴ）
 */
function getSiteDefaults(shop?: ShopFragment | null) {
  const brand = shop?.brand;
  return {
    siteName: shop?.name || BRAND,
    title: brand?.slogan || DEFAULT_TITLE,
    description: truncate(
      brand?.shortDescription || shop?.description || DEFAULT_DESCRIPTION,
    ),
    image: brand?.coverImage?.image?.url || brand?.logo?.image?.url,
  };
}

function root({
  shop,
  url,
}: {
  shop: ShopFragment;
  url: Request['url'];
}): SeoConfig {
  const site = getSiteDefaults(shop);
  return {
    // 個別タイトルが無いページはこのタイトル（スローガン／規定タイトル）が使われる。
    // 個別タイトルがあるページは titleTemplate により「○○ | 店名」となる。
    title: site.title,
    titleTemplate: `%s | ${site.siteName}`,
    description: site.description,
    handle: '@hon_matsuba',
    url,
    media: site.image,
    robots: {
      noIndex: false,
      noFollow: false,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: shop.name,
      logo: shop.brand?.logo?.image?.url,
      sameAs: [
        'https://x.com/hon_matsuba',
        'https://www.instagram.com/hon_kimonomatsuba/',
      ],
      url,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${url}search?q={search_term}`,
        query: "required name='search_term'",
      },
    },
  };
}

function home(options?: {shop?: ShopFragment | null}): SeoConfig {
  const site = getSiteDefaults(options?.shop);
  return {
    // トップページのタイトルは規定タイトルそのもの（接尾辞なし）
    title: site.title,
    titleTemplate: '%s',
    description: site.description,
    media: site.image,
    robots: {
      noIndex: false,
      noFollow: false,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: site.title,
    },
  };
}

type SelectedVariantRequiredFields = Pick<ProductVariant, 'sku'> & {
  image?: null | Partial<Image>;
};

type ProductRequiredFields = Pick<
  Product,
  'title' | 'description' | 'vendor' | 'seo'
> & {
  variants: {
    nodes: Array<
      Pick<
        ProductVariant,
        'sku' | 'price' | 'selectedOptions' | 'availableForSale'
      >
    >;
  };
};

function productJsonLd({
  product,
  selectedVariant,
  url,
}: {
  product: ProductRequiredFields;
  selectedVariant: SelectedVariantRequiredFields;
  url: Request['url'];
}): SeoConfig['jsonLd'] {
  const origin = new URL(url).origin;
  const variants = product.variants.nodes;
  const description = truncate(
    product?.seo?.description ?? product?.description,
  );
  const offers: Offer[] = (variants || []).map((variant) => {
    const variantUrl = new URL(url);
    for (const option of variant.selectedOptions) {
      variantUrl.searchParams.set(option.name, option.value);
    }
    const availability = variant.availableForSale
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock';

    return {
      '@type': 'Offer',
      availability,
      price: parseFloat(variant.price.amount),
      priceCurrency: variant.price.currencyCode,
      sku: variant?.sku ?? '',
      url: variantUrl.toString(),
    };
  });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Products',
          item: `${origin}/products`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: product.title,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      brand: {
        '@type': 'Brand',
        name: product.vendor,
      },
      description,
      image: selectedVariant?.image?.url ? [selectedVariant.image.url] : [],
      name: product.title,
      offers,
      sku: selectedVariant?.sku ?? '',
      url,
    },
  ];
}

function product({
  product,
  url,
  selectedVariant,
}: {
  product: ProductRequiredFields;
  selectedVariant: SelectedVariantRequiredFields;
  url: Request['url'];
}): SeoConfig {
  // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
  const description = truncate(
    product?.seo?.description || product?.description || '',
  );
  return {
    ...buildTitle(product?.seo?.title || product?.title),
    description,
    media: selectedVariant?.image,
    jsonLd: productJsonLd({product, selectedVariant, url}),
  };
}

type CollectionRequiredFields = Omit<
  Collection,
  'products' | 'descriptionHtml' | 'metafields' | 'image' | 'updatedAt'
> & {
  products: {nodes: Pick<Product, 'handle'>[]};
  image?: null | Pick<Image, 'url' | 'height' | 'width' | 'altText'>;
  descriptionHtml?: null | Collection['descriptionHtml'];
  updatedAt?: null | Collection['updatedAt'];
  metafields?: null | Collection['metafields'];
};

function collectionJsonLd({
  url,
  collection,
}: {
  url: Request['url'];
  collection: CollectionRequiredFields;
}): SeoConfig['jsonLd'] {
  const siteUrl = new URL(url);
  const itemListElement: CollectionPage['mainEntity'] =
    collection.products.nodes.map((product, index) => {
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl.origin}/products/${product.handle}`,
      };
    });

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Collections',
          item: `${siteUrl.origin}/collections`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: collection.title,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: collection?.seo?.title ?? collection?.title ?? '',
      description: truncate(
        collection?.seo?.description ?? collection?.description ?? '',
      ),
      image: collection?.image?.url,
      url: `${siteUrl.origin}/collections/${collection.handle}`,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement,
      },
    },
  ];
}

function collection({
  collection,
  url,
}: {
  collection: CollectionRequiredFields;
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle(collection?.seo?.title || collection?.title),
    // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
    description: truncate(
      collection?.seo?.description || collection?.description || '',
    ),
    media: {
      type: 'image',
      url: collection?.image?.url,
      height: collection?.image?.height,
      width: collection?.image?.width,
      altText: collection?.image?.altText,
    },
    jsonLd: collectionJsonLd({collection, url}),
  };
}

type CollectionListRequiredFields = {
  nodes: Omit<CollectionRequiredFields, 'products'>[];
};

function collectionsJsonLd({
  url,
  collections,
}: {
  url: Request['url'];
  collections: CollectionListRequiredFields;
}): SeoConfig['jsonLd'] {
  const origin = new URL(url).origin;
  const itemListElement: CollectionPage['mainEntity'] = collections.nodes.map(
    (collection, index) => {
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: `${origin}/collections/${collection.handle}`,
      };
    },
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'すべてのカテゴリ',
    description: 'すべての商品カテゴリの一覧です。',
    url,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement,
    },
  };
}

function listCollections({
  collections,
  url,
}: {
  collections: CollectionListRequiredFields;
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle('すべてのカテゴリ'),
    description: 'すべての商品カテゴリの一覧です。',
    url,
    jsonLd: collectionsJsonLd({collections, url}),
  };
}

function article({
  article,
  url,
}: {
  article: Pick<
    Article,
    'title' | 'contentHtml' | 'seo' | 'publishedAt' | 'excerpt'
  > & {
    image?: null | Pick<
      NonNullable<Article['image']>,
      'url' | 'height' | 'width' | 'altText'
    >;
  };
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle(article?.seo?.title || article?.title),
    // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
    description: truncate(article?.seo?.description || article?.excerpt || ''),
    url,
    media: {
      type: 'image',
      url: article?.image?.url,
      height: article?.image?.height,
      width: article?.image?.width,
      altText: article?.image?.altText,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      alternativeHeadline: article.title,
      articleBody: article.contentHtml,
      datePublished: article?.publishedAt,
      description: truncate(
        article?.seo?.description || article?.excerpt || '',
      ),
      headline: article?.seo?.title || '',
      image: article?.image?.url,
      url,
    },
  };
}

function blog({
  blog,
  url,
}: {
  blog: Pick<Blog, 'seo' | 'title'>;
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle(blog?.seo?.title || blog?.title),
    // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
    description: truncate(blog?.seo?.description || ''),
    url,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: blog?.seo?.title || blog?.title || '',
      description: blog?.seo?.description || '',
      url,
    },
  };
}

function page({
  page,
  url,
}: {
  page: Pick<Page, 'title' | 'seo'>;
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle(page?.seo?.title || page?.title),
    // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
    description: truncate(page?.seo?.description || ''),
    url,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
    },
  };
}

function policy({
  policy,
  url,
}: {
  policy: Pick<ShopPolicy, 'title' | 'body'>;
  url: Request['url'];
}): SeoConfig {
  return {
    ...buildTitle(policy?.title),
    // 説明が無い場合は空にして、root（＝ブランド設定の説明）にフォールバックさせる
    description: truncate(policy?.body || ''),
    url,
  };
}

function policies({
  policies,
  url,
}: {
  policies: Array<Pick<ShopPolicy, 'title' | 'handle'>>;
  url: Request['url'];
}): SeoConfig {
  const origin = new URL(url).origin;
  const itemListElement: BreadcrumbList['itemListElement'] = policies
    .filter(Boolean)
    .map((policy, index) => {
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: policy.title,
        item: `${origin}/policies/${policy.handle}`,
      };
    });
  return {
    ...buildTitle('ポリシー'),
    description: '各種ポリシー・規約の一覧です。',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        description: '各種ポリシー・規約の一覧です。',
        name: 'ポリシー',
        url,
      },
    ],
  };
}

export const seoPayload = {
  article,
  blog,
  collection,
  home,
  listCollections,
  page,
  policies,
  policy,
  product,
  root,
};

/**
 * Truncate a string to a given length, adding an ellipsis if it was truncated
 * @param str - The string to truncate
 * @param num - The maximum length of the string
 * @returns The truncated string
 * @example
 * ```js
 * truncate('Hello world', 5) // 'Hello...'
 * ```
 */
function truncate(str: string, num = 155): string {
  if (typeof str !== 'string') return '';
  if (str.length <= num) {
    return str;
  }
  return str.slice(0, num - 3) + '...';
}
