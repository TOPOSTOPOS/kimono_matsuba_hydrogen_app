/**
 * 下書き（Draft）商品プレビュー用の Admin API ヘルパー。
 *
 * Storefront API は下書き商品を返せないため、プレビュー時のみ Admin GraphQL API から
 * 商品を取得し、Storefront の描画形（PRODUCT_QUERY 相当）に変換して差し替える。
 *
 * 必要な環境変数（未設定なら getPreviewProduct は null を返し、通常の 404 挙動に戻る）:
 * - PRIVATE_ADMIN_API_TOKEN … カスタムアプリの Admin API アクセストークン（shpat_…）
 * - PREVIEW_TOKEN           … プレビュー用の秘密トークン（?preview_token= と一致で有効）
 */

// Admin API のバージョン。必要に応じて更新可。
const ADMIN_API_VERSION = '2025-01';

const CURRENCY_CODE = 'JPY';

type SelectedOption = {name: string; value: string};

// Storefront の PRODUCT_QUERY / VARIANTS_QUERY が返す最低限の形に合わせた型（緩め）
type MappedMoney = {amount: string; currencyCode: string};

type MappedVariant = {
  id: string;
  availableForSale: boolean;
  selectedOptions: SelectedOption[];
  image: {
    id: string | null;
    url: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
  price: MappedMoney;
  compareAtPrice: MappedMoney | null;
  unitPrice: MappedMoney | null;
  sku: string | null;
  title: string;
  product: {title: string; handle: string};
};

// 注意: これは Admin API 用クエリ。Storefront の codegen に拾われないよう
// あえて `#graphql` コメントを付けない（付けると Storefront スキーマで検証され失敗する）。
const ADMIN_PREVIEW_PRODUCT_QUERY = `
  query PreviewProduct($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        title
        handle
        vendor
        descriptionHtml
        description
        tags
        status
        seo {
          title
          description
        }
        options {
          name
          optionValues {
            name
          }
        }
        media(first: 50) {
          nodes {
            __typename
            mediaContentType
            alt
            preview {
              image {
                url
              }
            }
            ... on MediaImage {
              id
              image {
                id
                url
                width
                height
              }
            }
            ... on Video {
              id
              sources {
                mimeType
                url
              }
            }
            ... on Model3d {
              id
              sources {
                mimeType
                url
              }
            }
            ... on ExternalVideo {
              id
              embedUrl
              host
            }
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            availableForSale
            sku
            selectedOptions {
              name
              value
            }
            price
            compareAtPrice
            image {
              id
              url
              altText
              width
              height
            }
          }
        }
        metafields(first: 100, namespace: "custom") {
          nodes {
            id
            key
            value
          }
        }
      }
    }
  }
`;

function money(value: string | null | undefined): MappedMoney | null {
  if (value == null || value === '') return null;
  return {amount: String(value), currencyCode: CURRENCY_CODE};
}

function mapVariant(
  raw: any,
  productTitle: string,
  productHandle: string,
): MappedVariant {
  return {
    id: raw.id,
    availableForSale: raw.availableForSale ?? true,
    selectedOptions: (raw.selectedOptions ?? []).map((o: any) => ({
      name: o.name,
      value: o.value,
    })),
    image: raw.image
      ? {
          id: raw.image.id ?? null,
          url: raw.image.url,
          altText: raw.image.altText ?? null,
          width: raw.image.width ?? null,
          height: raw.image.height ?? null,
        }
      : null,
    price: money(raw.price) ?? {amount: '0', currencyCode: CURRENCY_CODE},
    compareAtPrice: money(raw.compareAtPrice),
    unitPrice: null,
    sku: raw.sku ?? null,
    title: raw.title,
    product: {title: productTitle, handle: productHandle},
  };
}

function mapMedia(raw: any) {
  return {
    __typename: raw.__typename,
    mediaContentType: raw.mediaContentType,
    alt: raw.alt ?? null,
    previewImage: raw.preview?.image?.url ? {url: raw.preview.image.url} : null,
    id: raw.id ?? null,
    image: raw.image
      ? {
          id: raw.image.id ?? null,
          url: raw.image.url,
          width: raw.image.width ?? null,
          height: raw.image.height ?? null,
        }
      : undefined,
    sources: raw.sources ?? undefined,
    embedUrl: raw.embedUrl ?? undefined,
    host: raw.host ?? undefined,
  };
}

/**
 * URL の selectedOptions に一致するバリアントを解決（大文字小文字無視・未知オプション無視）。
 * Storefront の variantBySelectedOptions を模倣。一致なしは null。
 */
function resolveSelectedVariant(
  variants: MappedVariant[],
  selectedOptions: SelectedOption[],
  optionNames: string[],
): MappedVariant | null {
  const lowerOptionNames = optionNames.map((n) => n.toLowerCase());
  // 商品に存在するオプションだけで判定（未知オプションは無視）
  const relevant = selectedOptions.filter((sel) =>
    lowerOptionNames.includes(sel.name.toLowerCase()),
  );
  if (relevant.length === 0) return null;

  return (
    variants.find((v) =>
      relevant.every((sel) =>
        v.selectedOptions.some(
          (o) =>
            o.name.toLowerCase() === sel.name.toLowerCase() &&
            o.value.toLowerCase() === sel.value.toLowerCase(),
        ),
      ),
    ) ?? null
  );
}

/**
 * プレビューリクエストが有効か（PREVIEW_TOKEN と一致するか）。
 */
export function isValidPreviewRequest(
  request: Request,
  env: {PREVIEW_TOKEN?: string},
): boolean {
  const token = new URL(request.url).searchParams.get('preview_token');
  return Boolean(token && env.PREVIEW_TOKEN && token === env.PREVIEW_TOKEN);
}

type PreviewProductResult = {
  /** PRODUCT_QUERY の product 相当（Storefront 形にマップ済み） */
  product: any;
  /** PRODUCT_RENTAL_METAFIELDS_QUERY の結果相当 */
  rentalMetafields: {
    product: {metafields: Array<{key: string; value: string}>};
  };
  /** VARIANTS_QUERY の product.variants.nodes 相当（全バリアント） */
  variantsNodes: MappedVariant[];
};

/**
 * Admin API から下書き商品を取得し、Storefront 描画形にマップして返す。
 * トークン未設定・商品なし・エラー時は null（呼び出し側は通常の 404 にフォールバック）。
 */
export async function getPreviewProduct(
  env: {PRIVATE_ADMIN_API_TOKEN?: string; PUBLIC_STORE_DOMAIN?: string},
  handle: string,
  selectedOptions: SelectedOption[],
): Promise<PreviewProductResult | null> {
  if (!env.PRIVATE_ADMIN_API_TOKEN || !env.PUBLIC_STORE_DOMAIN) {
    return null;
  }

  const endpoint = `https://${env.PUBLIC_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  let json: any;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.PRIVATE_ADMIN_API_TOKEN,
      },
      body: JSON.stringify({
        query: ADMIN_PREVIEW_PRODUCT_QUERY,
        // handle 完全一致で検索（下書き商品も含む）
        variables: {query: `handle:'${handle.replace(/'/g, "\\'")}'`},
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[preview] Admin API HTTP error', res.status);
      return null;
    }
    json = await res.json();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[preview] Admin API fetch failed', error);
    return null;
  }

  if (json?.errors) {
    // eslint-disable-next-line no-console
    console.error('[preview] Admin API GraphQL errors', json.errors);
    return null;
  }

  const raw = json?.data?.products?.nodes?.[0];
  if (!raw) return null;

  const options = (raw.options ?? []).map((o: any) => ({
    name: o.name,
    values: (o.optionValues ?? []).map((v: any) => v.name),
  }));
  const optionNames = options.map((o: {name: string}) => o.name);

  const variantsNodes: MappedVariant[] = (raw.variants?.nodes ?? []).map(
    (v: any) => mapVariant(v, raw.title, raw.handle),
  );

  const selectedVariant = resolveSelectedVariant(
    variantsNodes,
    selectedOptions,
    optionNames,
  );

  const metafieldNodes: Array<{key: string; value: string}> = (
    raw.metafields?.nodes ?? []
  ).map((m: any) => ({key: m.key, value: m.value}));

  const product = {
    id: raw.id,
    title: raw.title,
    vendor: raw.vendor ?? '',
    handle: raw.handle,
    descriptionHtml: raw.descriptionHtml ?? '',
    description: raw.description ?? '',
    options,
    selectedVariant,
    media: {nodes: (raw.media?.nodes ?? []).map(mapMedia)},
    // PRODUCT_QUERY の variants は first:1。先頭のみ入れておく（全件は deferred 側で差し替え）
    variants: {nodes: variantsNodes.slice(0, 1)},
    seo: {
      title: raw.seo?.title ?? raw.title,
      description: raw.seo?.description ?? raw.description ?? '',
    },
    // PRODUCT_QUERY は is_enable_belt_option / is_enable_tabi_option のみ参照
    metafields: metafieldNodes
      .filter(
        (m) =>
          m.key === 'is_enable_belt_option' ||
          m.key === 'is_enable_tabi_option',
      )
      .map((m) => ({id: null, key: m.key, value: m.value})),
    tags: raw.tags ?? [],
  };

  return {
    product,
    rentalMetafields: {product: {metafields: metafieldNodes}},
    variantsNodes,
  };
}
