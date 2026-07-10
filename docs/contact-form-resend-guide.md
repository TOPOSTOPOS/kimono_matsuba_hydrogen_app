# Hydrogen お問い合わせフォーム（Resend メール送信）実装ガイド（Claude 依頼用）

> このドキュメントをそのまま Claude Code に貼り付け、「この仕様でお問い合わせフォームを実装して」と依頼すれば実装できます。
> 目的：ヘッドレス構成では Shopify 標準の問い合わせ機能が使えないため、
> **フォーム → Remix action → Resend でショップ宛にメール送信**する。

---

## 構成

- ルート `app/routes/($locale).contact.tsx`（`/contact`）
  - `loader`：SEO 用のデータ
  - `action`：サーバー側バリデーション → メール送信
  - コンポーネント：フォーム＋成功/エラー表示
- 送信処理 `app/lib/contact.server.ts`（Resend REST API を fetch）
- 環境変数：`RESEND_API_KEY` / `CONTACT_FROM_EMAIL` / `CONTACT_TO_EMAIL`

フォーム項目（例。プロジェクトに合わせて増減）：お名前・ふりがな・電話番号・メールアドレス・お問い合わせ内容（すべて必須）。

---

## パート 1：送信処理 `app/lib/contact.server.ts`

```ts
/**
 * お問い合わせのメール送信（Resend）。
 * 必要な環境変数（未設定なら ok:false / not_configured を返す）:
 * - RESEND_API_KEY     … Resend の APIキー
 * - CONTACT_FROM_EMAIL … 送信元（Resendで認証済みドメインのアドレス）
 * - CONTACT_TO_EMAIL   … 受信先（ショップの問い合わせ受付アドレス／認証不要・どこでも可）
 */
export type ContactInput = {
  name: string;
  furigana: string;
  phone: string;
  email: string;
  message: string;
};

type SendResult = {ok: boolean; reason?: 'not_configured' | 'send_failed'};
type ContactEnv = {
  RESEND_API_KEY?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_TO_EMAIL?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendContactEmail(
  env: ContactEnv,
  data: ContactInput,
): Promise<SendResult> {
  const {RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL} = env;
  if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL || !CONTACT_TO_EMAIL) {
    // 未設定でも問い合わせを失わないようログに残す
    console.warn('[contact] メール送信が未設定です。受信内容:', data);
    return {ok: false, reason: 'not_configured'};
  }

  const lines: [string, string][] = [
    ['お名前', data.name],
    ['ふりがな', data.furigana],
    ['電話番号', data.phone],
    ['メールアドレス', data.email],
    ['お問い合わせ内容', data.message],
  ];
  const text = lines.map(([k, v]) => `${k}：\n${v}`).join('\n\n');
  const html = `<table style="border-collapse:collapse;font-family:sans-serif">${lines
    .map(
      ([k, v]) =>
        `<tr><th align="left" style="padding:6px 12px;background:#f5f5f5;vertical-align:top;white-space:nowrap">${escapeHtml(
          k,
        )}</th><td style="padding:6px 12px;white-space:pre-wrap">${escapeHtml(
          v,
        )}</td></tr>`,
    )
    .join('')}</table>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: [CONTACT_TO_EMAIL],
        reply_to: data.email, // 届いたメールに返信するとお客様へ直接返信できる
        subject: `【お問い合わせ】${data.name} 様`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      console.error('[contact] Resend送信失敗', res.status, await res.text());
      return {ok: false, reason: 'send_failed'};
    }
    return {ok: true};
  } catch (error) {
    console.error('[contact] Resend送信エラー', error);
    return {ok: false, reason: 'send_failed'};
  }
}
```

---

## パート 2：ルート `app/routes/($locale).contact.tsx`

### 2-1. loader / meta / action（バリデーション＋送信）

```ts
import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import type {ActionFunctionArgs, MetaArgs} from '@shopify/remix-oxygen';
import {getSeoMeta} from '@shopify/hydrogen';
import {sendContactEmail, type ContactInput} from '~/lib/contact.server';

export async function loader({request}: LoaderFunctionArgs) {
  return json({seo: {title: 'お問い合わせ', url: request.url}});
}
export const meta = ({matches}: MetaArgs<typeof loader>) =>
  getSeoMeta(...matches.map((m) => (m.data as any).seo));

type FieldName = keyof ContactInput;

// ひらがな・カタカナ・長音・スペース（\s は全角スペース U+3000 も含む）
const KANA_RE = /^[぀-ヿ\s]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9\-+()\s]{8,20}$/;

export async function action({request, context}: ActionFunctionArgs) {
  const fd = await request.formData();
  const g = (k: FieldName) => (fd.get(k) as string | null)?.trim() ?? '';
  const values: Record<FieldName, string> = {
    name: g('name'),
    furigana: g('furigana'),
    phone: g('phone'),
    email: g('email'),
    message: g('message'),
  };
  const errors: Partial<Record<FieldName, string>> = {};
  if (!values.name) errors.name = 'お名前を入力してください。';
  if (!values.furigana) errors.furigana = 'ふりがなを入力してください。';
  else if (!KANA_RE.test(values.furigana))
    errors.furigana = 'ふりがなは、ひらがな・カタカナで入力してください。';
  if (!values.phone) errors.phone = '電話番号を入力してください。';
  else if (!PHONE_RE.test(values.phone))
    errors.phone = '電話番号を正しく入力してください。';
  if (!values.email) errors.email = 'メールアドレスを入力してください。';
  else if (!EMAIL_RE.test(values.email))
    errors.email = 'メールアドレスを正しく入力してください。';
  if (!values.message) errors.message = 'お問い合わせ内容を入力してください。';

  if (Object.keys(errors).length > 0)
    return json({errors, values}, {status: 400});

  const result = await sendContactEmail(context.env, values);
  if (!result.ok)
    return json(
      {
        formError:
          '送信中にエラーが発生しました。時間をおいて再度お試しください。',
        values,
      },
      {status: 500},
    );
  return json({ok: true});
}
```

### 2-2. コンポーネント（フォーム／成功・エラー表示）

- `<Form method="post" noValidate>`＋各 input に `required`、`type="email"`/`type="tel"`。
- サーバーの `errors` を項目下に、`formError` を上部に表示。エラー時は `values` を `defaultValue` で復元。
- `useNavigation()` の `state === 'submitting'` で送信ボタンを「送信中…」に。
- `actionData.ok` のとき「送信が完了しました」画面に切替。

（UI はプロジェクトの共通コンポーネント／Tailwind に合わせて実装する）

### 2-3. `env.d.ts` の `Env` に追記

```ts
RESEND_API_KEY?: string;
CONTACT_FROM_EMAIL?: string;
CONTACT_TO_EMAIL?: string;
```

---

## パート 3：Resend の準備（人間の作業）

1. **Resend アカウント作成** → API キー発行（`re_…`）
2. **送信元ドメインを認証**（DNS に SPF/DKIM レコードを追加）。
   - `CONTACT_FROM_EMAIL` は **認証済みドメインのアドレス**にする（例：`noreply@yourdomain.com`）。
   - 未認証で試すだけなら Resend のテスト送信元 `onboarding@resend.dev`（※自分のアカウント登録メール宛にしか届かない）。
3. **`CONTACT_TO_EMAIL` は受信先で認証不要**。送信元と別ドメインでも可（例：from が `.co.jp`、to が `.com` でも OK）。
4. 環境変数を設定：
   - **ローカル `.env`**（※ `.env` は git 追跡しない）
   - **本番（Oxygen）**：Hydrogen 販売チャネル → 環境変数（Secret）。Production・Preview 両方。
     ⚠️ **Oxygen の環境変数は次回デプロイから反映**。設定後は再デプロイが必要。

---

## チェックリスト / つまずきポイント

- [ ] `from` は **Resend 認証済みドメイン**のアドレス必須（未認証だと送信不可）。`to` は任意。
- [ ] 本番でエラーになる典型原因は **Oxygen 環境変数の未設定 or 再デプロイ未反映**。
      ログに `メール送信が未設定です` が出ていれば env 未反映、`Resend送信失敗` が出ていれば Resend 側の問題。
- [ ] `.env` を git 追跡しない（API キー流出防止。公開リポジトリでは特に）。
- [ ] API キーを共有した後は、運用開始時に Resend 側でローテーション推奨。
- [ ] 他サービス（SendGrid 等）に替える場合は `sendContactEmail` だけ差し替えれば OK。
- [ ] `reply_to` にお客様のメールを入れておくと、受信メールへの返信がそのままお客様に届く。

---

## Claude への一言依頼例

> 「上記ガイドのとおり、`/contact` にお問い合わせフォームを実装して。
> `app/lib/contact.server.ts`（Resend 送信）と `($locale).contact.tsx`（loader/action/フォーム）を作成し、
> サーバー側バリデーション（必須・ふりがなは仮名・メール/電話の形式）と成功/エラー表示、`env.d.ts` の追記も。
> UI はこのプロジェクトの共通コンポーネントに合わせて。実装後は `npx tsc --noEmit` と ESLint が通ることを確認して。」
