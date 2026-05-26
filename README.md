# Hydrogen template: Demo Store

Hydrogen is Shopify’s stack for headless commerce. Hydrogen is designed to dovetail with [Remix](https://remix.run/), Shopify’s full stack web framework. This template contains a **full-featured setup** of components, queries and tooling to get started with Hydrogen. It is deployed at [hydrogen.shop](https://hydrogen.shop)

[Check out Hydrogen docs](https://shopify.dev/custom-storefronts/hydrogen)
[Get familiar with Remix](https://remix.run/docs/en/v1)

## What's included

- Remix
- Hydrogen
- Oxygen
- Shopify CLI
- ESLint
- Prettier
- GraphQL generator
- TypeScript and JavaScript flavors
- Tailwind CSS (via PostCSS)
- Full-featured setup of components and routes

## Getting started

**Requirements:**

- Node.js version 18.0.0 or higher

```bash
npm create @shopify/hydrogen@latest -- --template demo-store
```

Remember to update `.env` with your shop's domain and Storefront API token!

## Building for production

```bash
npm run build
```

## Local development

```bash
npm run dev
```

## レンタル商品ページ - Shopify 管理画面設定手順

### 5-1. メタフィールド定義の作成

管理画面 → 設定 → カスタムデータ → 商品 から以下の 3 つを作成する。

| 名前           | 名前空間 | キー              | 型            | 説明                                                                   |
| -------------- | -------- | ----------------- | ------------- | ---------------------------------------------------------------------- |
| レンタルフラグ | custom   | is_rental         | Boolean       | レンタル商品に `true` を設定。カレンダー・レンタル期間 UI の表示を制御 |
| 振袖フラグ     | custom   | is_furisode       | Boolean       | 振袖商品に `true` を設定                                               |
| 袴フラグ       | custom   | is_hakama         | Boolean       | 袴商品に `true` を設定                                                 |
| レンタル不可日 | custom   | unavailable_dates | リスト > 日付 | レンタル不可日の配列。管理画面で日付ピッカーから入力可能               |

### 5-2. 各商品へのフラグ設定

- **全レンタル商品**（振袖・袴・その他）：`custom.is_rental` を `true` に設定
- 振袖商品：さらに `custom.is_furisode` を `true` に設定
- 袴商品：さらに `custom.is_hakama` を `true` に設定
- 購入商品（髪飾りなど）：全フラグを設定しない（通常の購入フローになる）

### 5-3. 振袖商品のバリエーション追加手順

管理画面 → 商品 → 対象の振袖商品 → バリエーションに以下 3 つを追加する。

| バリエーション名 | 価格         | レンタル期間          |
| ---------------- | ------------ | --------------------- |
| 2〜12 月用       | 通常料金     | 3 泊 4 日             |
| 1 月用           | 1 月専用料金 | 5 泊 6 日（自動判定） |
| 下見レンタル用   | ¥3,300       | 1 泊 2 日（自動判定） |

> レンタル期間はバリエーション名に「1 月用」「下見」が含まれると自動判定される。

### 5-4. オプション商品の作成

以下の商品を新規作成し、**必ずタグを設定**する。

#### 安心パック

- 商品名：任意（例：「基本安心パック」）
- 価格：¥1,100
- タグ：`安心パック` と `オプション` の両方を設定

#### 刺繍半衿オプション

- 商品名：任意（例：「刺繍半衿オプション」）
- 価格：¥2,000
- タグ：`刺繍半衿` と `オプション` の両方を設定

> タグが正しく設定されないと商品ページにオプションが表示されない。

### 5-5. レンタル不可日の登録・更新方法

1. 管理画面 → 商品 → 対象商品 → メタフィールド
2. `custom.unavailable_dates`（リスト > 日付）の「値を追加」から日付ピッカーで入力

- 商品ごとに個別管理（他商品の不可日とは独立）
- ご成約いただいた日程は随時追加する
- 日付フォーマットは自動的に `YYYY-MM-DD` に統一される

### 5-6. 型生成の再実行（開発者向け）

GraphQL クエリを追加・変更した後は型生成を再実行してください。

```bash
npm run codegen
```

---

## Setup for using Customer Account API (`/account` section)

### Setup public domain using ngrok

1. Setup a [ngrok](https://ngrok.com/) account and add a permanent domain (ie. `https://<your-ngrok-domain>.app`).
1. Install the [ngrok CLI](https://ngrok.com/download) to use in terminal
1. Start ngrok using `ngrok http --domain=<your-ngrok-domain>.app 3000`

### Include public domain in Customer Account API settings

1. Go to your Shopify admin => `Hydrogen` or `Headless` app/channel => Customer Account API => Application setup
1. Edit `Callback URI(s)` to include `https://<your-ngrok-domain>.app/account/authorize`
1. Edit `Javascript origin(s)` to include your public domain `https://<your-ngrok-domain>.app` or keep it blank
1. Edit `Logout URI` to include your public domain `https://<your-ngrok-domain>.app` or keep it blank
