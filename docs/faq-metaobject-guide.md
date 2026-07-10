# Hydrogen FAQ（メタオブジェクト管理）実装ガイド（Claude 依頼用）

> このドキュメントをそのまま Claude Code に貼り付け、「この仕様で FAQ を実装して」と依頼すれば実装できます。
> 目的：**よくある質問（FAQ）を Shopify 管理画面（メタオブジェクト）から編集できる**ようにし、
> ストアフロントでアコーディオン表示＋**FAQPage 構造化データ（SEO）**を出す。

---

## なぜメタオブジェクトか

- メタフィールドは「1 リソースに紐づく 1 値」で、可変長の Q&A リストの編集に不向き（JSON の塊になる）。
- **メタオブジェクト**なら **1 問＝ 1 エントリ**で、質問・回答・カテゴリ・並び順を構造化して管理画面から編集でき、項目追加も容易。複数ページで再利用も可能。
- おまけで **FAQPage JSON-LD** を出せて検索のリッチリザルト対象になる。

---

## パート 1：メタオブジェクト定義（type `faq`）

| フィールド | key          | 型                                       | 必須 |
| ---------- | ------------ | ---------------------------------------- | ---- |
| 質問       | `question`   | 単一行テキスト（single_line_text_field） | ✅   |
| 回答       | `answer`     | **リッチテキスト（rich_text_field）**    | ✅   |
| カテゴリ   | `category`   | 単一行テキスト                           |      |
| 表示順     | `sort_order` | 整数（number_integer）                   |      |

- **Storefront アクセス：PUBLIC_READ**（ストアフロントで表示可能に）
- **publishable：有効**（エントリを ACTIVE で公開）

> リッチテキストが不要なら `answer` を `multi_line_text_field` にしてよい（その場合、後述の RichText 変換は不要）。

作成方法は 2 通り：

- **手動**：設定 → カスタムデータ → メタオブジェクト → 定義を追加（上表のとおり）
- **スクリプト**：パート 3 の一括投入スクリプトが定義作成も行う（要 `write_metaobject_definitions` スコープ）

---

## パート 2：ストアフロント実装（Claude への指示）

FAQ を表示したいルートの loader で メタオブジェクトを取得し、コンポーネントでアコーディオン表示する。

### 2-1. loader（取得・グルーピング・JSON-LD）

```ts
import {getSeoMeta, RichText} from '@shopify/hydrogen';

const FAQ_CATEGORY_ORDER = [
  // 表示したいカテゴリ順に並べる（プロジェクトに合わせて）
];

type FaqItem = {
  question: string;
  answer: string;
  category: string;
  sort: number;
};
type FaqGroup = {category: string; items: FaqItem[]};

const FAQ_QUERY = `#graphql
  query FaqMetaobjects {
    metaobjects(type: "faq", first: 250) {
      nodes { fields { key value } }
    }
  }
` as const;

// リッチテキストJSON → プレーンテキスト（JSON-LD / フォールバック表示用）
function richTextToPlain(value: string): string {
  try {
    const doc: any = JSON.parse(value);
    const walk = (n: any): string =>
      n?.type === 'text'
        ? n.value ?? ''
        : Array.isArray(n?.children)
        ? n.children.map(walk).join('')
        : '';
    return Array.isArray(doc?.children)
      ? doc.children.map(walk).join('\n').trim()
      : walk(doc);
  } catch {
    return value;
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  let faqGroups: FaqGroup[] = [];
  try {
    const data: any = await context.storefront.query(FAQ_QUERY);
    const items: FaqItem[] = (data?.metaobjects?.nodes ?? []).map((n: any) => {
      const get = (k: string) =>
        n.fields.find((f: any) => f.key === k)?.value ?? '';
      return {
        question: get('question'),
        answer: get('answer'),
        category: get('category') || 'その他',
        sort: parseInt(get('sort_order') || '0', 10),
      };
    });
    const byCat = new Map<string, FaqItem[]>();
    for (const it of items) {
      if (!it.question) continue;
      if (!byCat.has(it.category)) byCat.set(it.category, []);
      byCat.get(it.category)!.push(it);
    }
    const orderedCats = [
      ...FAQ_CATEGORY_ORDER.filter((c) => byCat.has(c)),
      ...[...byCat.keys()].filter((c) => !FAQ_CATEGORY_ORDER.includes(c)),
    ];
    faqGroups = orderedCats.map((category) => ({
      category,
      items: byCat.get(category)!.sort((a, b) => a.sort - b.sort),
    }));
  } catch (error) {
    console.error('[faq] metaobject 取得失敗', error); // 未作成でもページは表示
  }

  const allFaq = faqGroups.flatMap((g) => g.items);
  const seo = {
    title: 'よくあるご質問',
    url: request.url,
    jsonLd:
      allFaq.length > 0
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: allFaq.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: richTextToPlain(f.answer),
              },
            })),
          }
        : undefined,
  };
  return json({faqGroups, seo});
}
```

### 2-2. 表示（アコーディオン＋リッチテキスト）

`@headlessui/react` の `Disclosure` を使用（無ければ `<details>` でも可）。

```tsx
// 回答（リッチテキストJSON）を描画。JSONでなければプレーン表示（保険）
function FaqAnswer({answer}: {answer: string}) {
  const t = (answer ?? '').trim();
  return t.startsWith('{') ? (
    <RichText data={t} />
  ) : (
    <p className="whitespace-pre-wrap">{answer}</p>
  );
}

// faqGroups をカテゴリ見出し＋アコーディオンで表示
{
  faqGroups.map((group) => (
    <div key={group.category}>
      <h3 className="pb-2 mb-3 font-bold border-b">{group.category}</h3>
      {group.items.map((item) => (
        <Disclosure key={item.question}>
          {({open}) => (
            <div className="rounded-lg border">
              <Disclosure.Button className="px-4 py-3 w-full text-left">
                <span className="mr-2 opacity-50">Q.</span>
                {item.question}
              </Disclosure.Button>
              <Disclosure.Panel className="px-4 pb-4 [&_p]:my-1 [&_a]:underline">
                <FaqAnswer answer={item.answer} />
              </Disclosure.Panel>
            </div>
          )}
        </Disclosure>
      ))}
    </div>
  ));
}
```

> `RichText` は `@shopify/hydrogen` から import。`answer` を `multi_line_text_field` にした場合は
> RichText を使わず `whitespace-pre-wrap` で素の文字列を表示すればよい。

---

## パート 3：初期データの一括投入（任意・Admin API）

Q&A を大量に入れたい場合の Node スクリプト。`scripts/faq-seed.json`（`[{question, answer, category, sort_order}]`）を用意して実行する。

- **必要スコープ**：エントリ作成に `write_metaobjects`。定義もスクリプトで作るなら `write_metaobject_definitions` も。
  定義を**管理画面で手動作成**すれば `write_metaobjects` だけでよい。
- **リッチテキスト変換**：`answer` を rich_text 型にした場合、プレーンテキストを下記 `toRichText()` で
  Shopify のリッチテキスト JSON に変換して渡す（そのままの文字列だと入らない）。

```js
// scripts/import-faq.mjs（抜粋）
const ADMIN_API_VERSION = '2025-01';

function toRichText(plain) {
  const lines = String(plain)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const children = (lines.length ? lines : ['']).map((line) => ({
    type: 'paragraph',
    children: [{type: 'text', value: line}],
  }));
  return JSON.stringify({type: 'root', children});
}

async function admin(query, variables) {
  const res = await fetch(
    `https://${DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({query, variables}),
    },
  );
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// 定義（無ければ作成。権限が無ければ手動作成前提でスキップ）
const DEF = `#graphql
  mutation($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { type }
      userErrors { code message }
    }
  }`;
// 各エントリ作成
const CREATE = `#graphql
  mutation($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id }
      userErrors { code message }
    }
  }`;

// definition: fieldDefinitions=[question(single_line,required), answer(rich_text_field,required),
//   category(single_line), sort_order(number_integer)], access {storefront: PUBLIC_READ},
//   capabilities {publishable {enabled:true}}
// create: type:"faq", capabilities {publishable {status: ACTIVE}}, fields:[
//   {key:'question', value:it.question},
//   {key:'answer', value: toRichText(it.answer)}, // rich_text の場合
//   {key:'category', value:it.category},
//   {key:'sort_order', value:String(it.sort_order)},
// ]
```

> 定義作成が権限エラー（`write_metaobject_definitions` 不足）になる場合は、**管理画面で定義だけ手動作成**し、
> スクリプトはエントリ作成のみ行うようにする（定義作成の try/catch で ACCESS_DENIED を握りつぶして続行）。

---

## チェックリスト / つまずきポイント

- [ ] メタオブジェクト定義の **Storefront アクセスを PUBLIC_READ** にしないと Storefront API から読めない。
- [ ] エントリは **ACTIVE（公開）** にする（下書き状態だと出ない）。
- [ ] `answer` をリッチテキストにした場合、値は **JSON 文字列**。表示は `@shopify/hydrogen` の `<RichText>`、
      JSON-LD は `richTextToPlain()` でプレーン化（JSON をそのまま渡さない）。
- [ ] 一括投入は `write_metaobjects`（＋定義も作るなら `write_metaobject_definitions`）が必要。
- [ ] メタオブジェクト未作成でもページが 500 にならないよう、取得は try/catch で握る。

---

## Claude への一言依頼例

> 「上記ガイドのとおり、FAQ を Shopify メタオブジェクト（type: "faq"）で管理する形で実装して。
> 指定ルートの loader で `metaobjects(type:"faq")` を取得し、カテゴリ別・表示順でアコーディオン表示、
> `answer` はリッチテキストなので `@shopify/hydrogen` の `RichText` で描画、FAQPage の JSON-LD も出して。
> 実装後は `npx tsc --noEmit` と ESLint が通ることを確認して。」
