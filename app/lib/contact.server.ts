/**
 * お問い合わせフォームの送信処理。
 *
 * ヘッドレス構成のため Shopify 標準の問い合わせ機能は使えない。
 * メール送信サービス（Resend）経由でショップ宛にメール送信する。
 *
 * 必要な環境変数（未設定なら ok:false / reason:'not_configured' を返す）:
 * - RESEND_API_KEY     … Resend の APIキー
 * - CONTACT_FROM_EMAIL … 送信元（Resendで認証済みドメインのアドレス）
 * - CONTACT_TO_EMAIL   … 受信先（ショップの問い合わせ受付アドレス）
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

function escapeHtml(str: string): string {
  return str
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
    // 送信サービス未設定。問い合わせが失われないようログには残す。
    // eslint-disable-next-line no-console
    console.warn('[contact] メール送信が未設定です。受信内容:', {
      name: data.name,
      furigana: data.furigana,
      phone: data.phone,
      email: data.email,
      message: data.message,
    });
    return {ok: false, reason: 'not_configured'};
  }

  const lines = [
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
        `<tr><th align="left" style="padding:6px 12px;background:#f5f5f5;white-space:nowrap;vertical-align:top">${escapeHtml(
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
        reply_to: data.email,
        subject: `【お問い合わせ】${data.name} 様`,
        text,
        html,
      }),
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[contact] Resend送信失敗', res.status, await res.text());
      return {ok: false, reason: 'send_failed'};
    }
    return {ok: true};
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[contact] Resend送信エラー', error);
    return {ok: false, reason: 'send_failed'};
  }
}
