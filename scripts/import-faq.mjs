/**
 * よくある質問（FAQ）を Shopify のメタオブジェクトに一括登録するスクリプト。
 *
 * 1) メタオブジェクト定義 type "faq" を作成（既存ならスキップ）
 * 2) scripts/faq-seed.json の全エントリを作成（ACTIVE / Storefront公開）
 *
 * 必要な環境変数（.env から自動読込）:
 * - PUBLIC_STORE_DOMAIN
 * - PRIVATE_ADMIN_API_TOKEN … ★ write_metaobjects スコープ必須（read_products だけでは不可）
 *
 * 実行: node scripts/import-faq.mjs
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_VERSION = '2025-01';

// .env を簡易読込
function loadEnv() {
  const env = {...process.env};
  try {
    const text = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env が無ければ process.env のみ */
  }
  return env;
}

const env = loadEnv();
const DOMAIN = env.PUBLIC_STORE_DOMAIN;
const TOKEN = env.PRIVATE_ADMIN_API_TOKEN;

if (!DOMAIN || !TOKEN) {
  console.error('PUBLIC_STORE_DOMAIN と PRIVATE_ADMIN_API_TOKEN が必要です');
  process.exit(1);
}

// プレーンテキスト（改行区切り）→ Shopify リッチテキスト JSON へ変換
function toRichText(plain) {
  const lines = String(plain)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const children = (lines.length ? lines : ['']).map((line) => ({
    type: 'paragraph',
    children: [{type: 'text', value: line}],
  }));
  return JSON.stringify({type: 'root', children});
}

async function admin(query, variables) {
  const res = await fetch(
    `https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
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

const DEFINITION_MUTATION = `#graphql
  mutation CreateDef($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type }
      userErrors { field message code }
    }
  }
`;

const CREATE_MUTATION = `#graphql
  mutation Create($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

async function ensureDefinition() {
  try {
    const data = await admin(DEFINITION_MUTATION, {
      definition: {
        name: 'よくある質問',
        type: 'faq',
        access: {storefront: 'PUBLIC_READ'},
        capabilities: {publishable: {enabled: true}},
        fieldDefinitions: [
          {key: 'question', name: '質問', type: 'single_line_text_field', required: true},
          {key: 'answer', name: '回答', type: 'rich_text_field', required: true},
          {key: 'category', name: 'カテゴリ', type: 'single_line_text_field'},
          {key: 'sort_order', name: '表示順', type: 'number_integer'},
        ],
      },
    });
    const errs = data.metaobjectDefinitionCreate.userErrors;
    if (errs.length) {
      if (errs.some((e) => e.code === 'TAKEN')) {
        console.log('定義 "faq" は既に存在します。エントリ作成に進みます。');
        return;
      }
      throw new Error('定義作成エラー: ' + JSON.stringify(errs, null, 2));
    }
    console.log('メタオブジェクト定義 "faq" を作成しました。');
  } catch (e) {
    const msg = String(e?.message ?? e);
    // 定義作成の権限が無い場合は、管理画面で手動作成済みとみなして項目投入へ進む
    if (
      msg.includes('write_metaobject_definitions') ||
      msg.includes('ACCESS_DENIED')
    ) {
      console.warn(
        '⚠ 定義の自動作成権限（write_metaobject_definitions）がありません。',
      );
      console.warn(
        '  → 管理画面で定義 "faq" を作成済みであれば、このまま項目投入を続行します。',
      );
      return;
    }
    throw e;
  }
}

async function main() {
  await ensureDefinition();

  const items = JSON.parse(
    readFileSync(join(__dirname, 'faq-seed.json'), 'utf-8'),
  );
  console.log(`${items.length} 件を登録します...`);

  let ok = 0;
  for (const it of items) {
    const data = await admin(CREATE_MUTATION, {
      metaobject: {
        type: 'faq',
        capabilities: {publishable: {status: 'ACTIVE'}},
        fields: [
          {key: 'question', value: it.question},
          {key: 'answer', value: toRichText(it.answer)},
          {key: 'category', value: it.category},
          {key: 'sort_order', value: String(it.sort_order)},
        ],
      },
    });
    const errs = data.metaobjectCreate.userErrors;
    if (errs.length) {
      console.error(`  NG: ${it.question} -> ${JSON.stringify(errs)}`);
    } else {
      ok += 1;
    }
  }
  console.log(`完了: ${ok}/${items.length} 件を登録しました。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
