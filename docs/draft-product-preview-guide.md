# Hydrogen 下書き商品プレビュー実装ガイド（Claude 依頼用）

> このドキュメントを **そのまま Claude Code（や同等の AI コーディング環境）に貼り付け**、
> 「この仕様で下書き商品プレビューを実装して」と依頼すれば実装できます。
> コードは汎用版です。プロジェクトの `PRODUCT_QUERY` の形に合わせて微調整してください。

---

## 目的 / 背景

- Shopify の **Storefront API は下書き（status = Draft）商品を返さない**。そのため Hydrogen（ヘッドレス）ストアでは、管理画面の「プレビュー」ボタンや `/products/<handle>` で下書きを閲覧できず 404 になる。
- **解決策**：プレビュー時のみ **Admin GraphQL API** で下書き商品を取得し、Storefront の描画形にマップして差し替える。
- **セキュリティ**：誰でも下書きを見られないよう、`?preview_token=<秘密>` が環境変数と一致したときだけプレビューを有効化する。

実装は次の 3 パート：

1. **コード**（Admin API フォールバック）
2. **Shopify 管理画面の準備**（カスタムアプリ＋トークン、環境変数）
3. **管理画面プレビューボタンの対応**（オンラインストアのリダイレクトテーマ改修）

---

## パート 1：コード実装（Claude への指示）

### 1-1. `app/lib/admin.server.ts` を新規作成

```ts
/**
 * 下書き（Draft）商品プレビュー用の Admin API ヘルパー。
 * Storefront API は下書きを返せないため、プレビュー時のみ Admin GraphQL API から取得し、
 * Storefront の PRODUCT_QUERY 相当の形にマップして差し替える。
 *
 * 必要な環境変数（未設定なら null を返し、通常の 404 挙動に戻る）:
 * - PRIVATE_ADMIN_API_TOKEN … カスタムアプリの Admin API アクセストークン（shpat_…）
 * - PREVIEW_TOKEN           … プレビュー用の秘密トークン（?preview_token= と一致で有効）
 */

// 使用する Admin API バージョン（存在する安定版に合わせる）
const ADMIN_API_VERSION = '2025-01';
// ストアの通貨（Admin API の price は通貨を持たないため補完する）
const CURRENCY_CODE = 'JPY';

type SelectedOption = {name: string; value: string};
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

// ⚠️ プロジェクトの PRODUCT_QUERY で使うフィールドに合わせて増減する
const ADMIN_PREVIEW_PRODUCT_QUERY = `#graphql
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
        seo { title description }
        options { name optionValues { name } }
        media(first: 50) {
          nodes {
            __typename
            mediaContentType
            alt
            preview { image { url } }
            ... on MediaImage { id image { id url width height } }
            ... on Video { id sources { mimeType url } }
            ... on Model3d { id sources { mimeType url } }
            ... on ExternalVideo { id embedUrl host }
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            availableForSale
            sku
            selectedOptions { name value }
            price
            compareAtPrice
            image { id url altText width height }
          }
        }
        metafields(first: 100, namespace: "custom") {
          nodes { id key value }
        }
      }
    }
  }
`;

function money(value: string | null | undefined): MappedMoney | null {
  if (value == null || value === '') return null;
  return {amount: String(value), currencyCode: CURRENCY_CODE};
}

function mapVariant(raw: any, title: string, handle: string): MappedVariant {
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
    product: {title, handle},
  };
}

function mapMedia(raw: any) {
  return {
    __typename: raw.__typename,
    mediaContentType: raw.mediaContentType,
    alt: raw.alt ?? null,
    // Admin は preview.image.url、Storefront は previewImage.url
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

// URL の selectedOptions に一致するバリアントを解決（大文字小文字無視・未知オプション無視）
function resolveSelectedVariant(
  variants: MappedVariant[],
  selectedOptions: SelectedOption[],
  optionNames: string[],
): MappedVariant | null {
  const lower = optionNames.map((n) => n.toLowerCase());
  const relevant = selectedOptions.filter((s) =>
    lower.includes(s.name.toLowerCase()),
  );
  if (relevant.length === 0) return null;
  return (
    variants.find((v) =>
      relevant.every((s) =>
        v.selectedOptions.some(
          (o) =>
            o.name.toLowerCase() === s.name.toLowerCase() &&
            o.value.toLowerCase() === s.value.toLowerCase(),
        ),
      ),
    ) ?? null
  );
}

/** プレビューリクエストが有効か（?preview_token= が env.PREVIEW_TOKEN と一致） */
export function isValidPreviewRequest(
  request: Request,
  env: {PREVIEW_TOKEN?: string},
): boolean {
  const token = new URL(request.url).searchParams.get('preview_token');
  return Boolean(token && env.PREVIEW_TOKEN && token === env.PREVIEW_TOKEN);
}

export type PreviewProductResult = {
  /** PRODUCT_QUERY の product 相当（Storefront 形にマップ済み） */
  product: any;
  /** 追加メタフィールド（custom 名前空間）。使わないなら無視してよい */
  metafields: Array<{key: string; value: string}>;
  /** 全バリアント（deferred な VARIANTS_QUERY の差し替え用） */
  variantsNodes: MappedVariant[];
};

/**
 * Admin API から下書き商品を取得し Storefront 描画形にマップして返す。
 * トークン未設定・商品なし・エラー時は null（呼び出し側で通常の 404 にフォールバック）。
 */
export async function getPreviewProduct(
  env: {PRIVATE_ADMIN_API_TOKEN?: string; PUBLIC_STORE_DOMAIN?: string},
  handle: string,
  selectedOptions: SelectedOption[],
): Promise<PreviewProductResult | null> {
  if (!env.PRIVATE_ADMIN_API_TOKEN || !env.PUBLIC_STORE_DOMAIN) return null;

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
        variables: {query: `handle:'${handle.replace(/'/g, "\\'")}'`},
      }),
    });
    if (!res.ok) {
      console.error('[preview] Admin API HTTP error', res.status);
      return null;
    }
    json = await res.json();
  } catch (error) {
    console.error('[preview] Admin API fetch failed', error);
    return null;
  }
  if (json?.errors) {
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
  const metafields: Array<{key: string; value: string}> = (
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
    variants: {nodes: variantsNodes.slice(0, 1)}, // 先頭のみ。全件は deferred 側で差し替え
    seo: {
      title: raw.seo?.title ?? raw.title,
      description: raw.seo?.description ?? raw.description ?? '',
    },
    metafields: metafields.map((m) => ({id: null, key: m.key, value: m.value})),
    tags: raw.tags ?? [],
  };

  return {product, metafields, variantsNodes};
}
```

### 1-2. `env.d.ts` の `Env` に追記

```ts
interface Env {
  // ...既存...
  PRIVATE_ADMIN_API_TOKEN?: string; // 下書きプレビュー用（未設定時は機能無効・通常404）
  PREVIEW_TOKEN?: string;
}
```

### 1-3. 商品ルートの loader にプレビュー分岐を追加

商品ページのルート（例：`app/routes/($locale).products.$productHandle.tsx`）の
`PRODUCT_QUERY` の結果を受けた直後に、以下を挿入する。

```ts
import {getPreviewProduct, isValidPreviewRequest} from '~/lib/admin.server';

// 既存の PRODUCT_QUERY 実行後（product が null になり得る箇所）で:
let product: any = fetchedProduct; // ← 既存の product を let にして再代入可能にする
let previewProduct: Awaited<ReturnType<typeof getPreviewProduct>> = null;
const isPreview = isValidPreviewRequest(request, context.env);
if (!product?.id && isPreview) {
  previewProduct = await getPreviewProduct(
    context.env,
    productHandle,
    getSelectedProductOptions(request), // 既存の selectedOptions を渡す
  );
  if (previewProduct) product = previewProduct.product;
}

// 以降の「!product なら 404 を throw」より前に上を置くこと。
// loader の戻り値に isPreview フラグを含める:
//   isPreview: Boolean(previewProduct),
//   previewVariants: previewProduct?.variantsNodes ?? null,
```

**deferred な全バリアント取得（VARIANTS_QUERY）がある場合**は、`loader` 本体で差し替える：

```ts
const deferredData = loadDeferredData(args);
const criticalData = await loadCriticalData(args);
if (criticalData.isPreview && criticalData.previewVariants) {
  (deferredData as any).variants = Promise.resolve({
    product: {variants: {nodes: criticalData.previewVariants}},
  });
}
return defer({...deferredData, ...criticalData});
```

> **重要**：`product` を `any` にすると、`product.metafields.find(...)` などのコールバック引数が
> 暗黙 any になり `noImplicitAny` でエラーになる箇所がある。その場合は引数に明示型を付ける
> （例：`(m: {key: string; value: string} | null) => ...`）。

### 1-4. プレビューであることを示すバナー（任意）

商品ページのコンポーネントで、loader の `isPreview` が true のときに表示：

```tsx
{
  isPreview && (
    <div className="px-4 py-2 text-sm text-center text-yellow-900 bg-yellow-100 border-b border-yellow-300">
      🔍 これは下書き商品のプレビューです（一般には公開されていません）
    </div>
  );
}
```

---

## パート 2：Shopify 管理画面の準備（人間の作業）

### 2-1. カスタムアプリで Admin API トークンを発行

1. 設定 → アプリと販売チャネル → **アプリを開発** →（初回は「カスタムアプリ開発を許可」）
2. **アプリを作成**（例：`Hydrogen Draft Preview`）
3. **構成** → Admin API 統合 → スコープ **`read_products`** を許可 → 保存
4. **インストール**
5. **API 資格情報** → 「Admin API アクセストークン」を**表示**（`shpat_…`）→ **その場でコピー**（一度きり）

> **⚠️ レガシーカスタムアプリの新規作成廃止について（将来の注意）**
> 管理画面「アプリを開発」で作るこの方式は **レガシーカスタムアプリ**であり、Shopify は
> 「**2026 年 1 月 1 日以降、新しいレガシーカスタムアプリを作成できなくなります（既存のアプリに影響はありません）**」
> と告知しています（※実際の作成可否・時期は環境により異なる場合あり）。
>
> 新規作成ができない場合は、**Shopify の新しいアプリ基盤（Dev Dashboard / Shopify CLI で作成したアプリ）を
> ストアにインストールして Admin API アクセストークンを取得**してください。
> いずれの方法でも、本ガイドの **コード（`admin.server.ts` / `?preview_token=` 分岐）は変更不要**です
> （`PRIVATE_ADMIN_API_TOKEN` に入れる値の“出所”が変わるだけ）。既存アプリはそのまま使い続けられます。

### 2-2. プレビュー用シークレットを生成

```
openssl rand -hex 16
```

### 2-3. 環境変数を設定

- **ローカル `.env`**（※ `.env` は必ず `.gitignore` 済み・git 未追跡にすること。公開リポジトリでは特に重要）
  ```
  PRIVATE_ADMIN_API_TOKEN=shpat_...
  PREVIEW_TOKEN=（openssl で生成した値）
  ```
- **本番（Oxygen）**：Shopify 管理画面 → Hydrogen（ヘッドレス）販売チャネル → 環境変数 に
  `PRIVATE_ADMIN_API_TOKEN` / `PREVIEW_TOKEN` を **Secret** で追加（Production・Preview 両方）。
  ※ Oxygen の環境変数は **次回デプロイから反映**。

### 2-4. 動作確認

```
https://<ストアフロント>/products/<下書き商品のハンドル>?preview_token=<PREVIEW_TOKEN>
```

- トークン無し／不一致 → 404（下書きは非公開）
- 一致 → 200 で下書きが表示

---

## パート 3：管理画面「プレビュー」ボタンを機能させる（リダイレクトテーマ）

Shopify のヘッドレス用「プレビュー」ボタンは `/products_preview?preview_key=…` を開くが、
**preview_key から商品を特定する公式手段がない**ため、これ単体では動かせない。
そこで **オンラインストアに Liquid のリダイレクトテーマ**（例：Shopify/hydrogen-redirect-theme や
instantcommerce/shopify-headless-theme）を入れ、`layout/theme.liquid` に以下を追加する。
Liquid テーマは下書きでも `product.handle` を取得できるため、上記の `?preview_token=` 付き URL へ転送できる。

```liquid
{%- comment -%} 下書き商品プレビュー: Hydrogen の ?preview_token= 付き URL へ転送 {%- endcomment -%}
{%- assign is_draft_preview = false -%}
{%- if product != blank and product.published_at == blank -%}
  {%- assign is_draft_preview = true -%}
{%- endif -%}

{%- if settings.storefront_hostname != blank and is_draft_preview -%}
<script>
  if (!window.Shopify.designMode) {
    window.location.replace(
      "https://{{ settings.storefront_hostname }}/products/{{ product.handle }}?preview_token=（PREVIEW_TOKEN と同じ値）"
    );
  }
</script>
{%- endif -%}
```

さらに、既存の「ホスト名を差し替えるだけ」のリダイレクト JS が下書きプレビューでも走らないよう、
そのブロックの条件に `and is_draft_preview == false` を追加してガードする。

> 注意：`preview_token` がテーマ HTML に載る（転送専用ストアなのでリスクは低いが、
> 気になる場合は運用後にローテーション）。

---

## つまずきポイント / チェックリスト

- [ ] `PRODUCT_QUERY` が使うフィールドと、Admin マッパーの出力形を **一致**させる（media / variant / options / selectedVariant / metafields）。
- [ ] Admin の `variant.price` は**通貨なしのスカラー**（例 `"1000.00"`）。Storefront 形 `{amount, currencyCode}` に包む（`CURRENCY_CODE` を実ストアに合わせる）。
- [ ] Admin の options は `optionValues { name }`（`values` は非推奨）。`values: string[]` に変換。
- [ ] Admin の media は `preview.image.url`、Storefront は `previewImage.url`。
- [ ] `product` を `any` にした箇所の暗黙 any を型注釈で解消。
- [ ] Admin API バージョンは実在する安定版に（存在しないと 404）。
- [ ] `.env` を git 追跡しない。公開リポジトリにトークンを入れない。
- [ ] トークンのスコープは `read_products` で足りる（PII 拡張は不要）。

---

## Claude への一言依頼例（このドキュメントと一緒に貼る）

> 「上記ガイドの通り、この Hydrogen プロジェクトに下書き商品プレビュー機能を実装して。
> `app/lib/admin.server.ts` を作成し、商品ルートの loader にプレビュー分岐を追加、
> `env.d.ts` に環境変数を追記、プレビューバナーも追加して。
> Admin マッパーの出力はこのプロジェクトの `PRODUCT_QUERY` の形に合わせること。
> 実装後は `npx tsc --noEmit` と ESLint が通ることを確認して。」
