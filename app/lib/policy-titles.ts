/**
 * ポリシーの日本語タイトル。
 * Shopify管理画面に登録されているタイトルが英語（Privacy policy など）のため、
 * サイト表示用にハンドルから日本語名を引く。
 * 未定義のハンドルは Shopify のタイトルをそのまま使う。
 */
const POLICY_TITLES: Record<string, string> = {
  'legal-notice': '特定商取引法に基づく表記',
  'privacy-policy': 'プライバシーポリシー',
  'terms-of-service': '利用規約',
  'refund-policy': '返金ポリシー',
  'shipping-policy': '配送ポリシー',
  'subscription-policy': '定期購入ポリシー',
  'contact-information': 'お問い合わせ先',
};

export function getPolicyTitle(
  handle?: string | null,
  fallback?: string | null,
): string {
  return (handle && POLICY_TITLES[handle]) || fallback || '';
}
