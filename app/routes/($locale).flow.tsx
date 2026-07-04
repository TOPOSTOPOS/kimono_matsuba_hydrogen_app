import {json} from '@shopify/remix-oxygen';
import type {MetaArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';
import {Disclosure} from '@headlessui/react';
import {getSeoMeta, RichText} from '@shopify/hydrogen';

import {PageHeader, Section, Heading, Text} from '~/components/Text';
import {Link} from '~/components/Link';
import {IconCaret} from '~/components/Icon';
import {routeHeaders} from '~/data/cache';

export const headers = routeHeaders;

// FAQ カテゴリの表示順
const FAQ_CATEGORY_ORDER = [
  'レンタルについて',
  '下見レンタルについて',
  'セット内容・商品について',
  'キャンセルについて',
  'お支払いについて',
  '着物全般について',
];

type FaqItem = {
  question: string;
  answer: string;
  category: string;
  sort: number;
};
type FaqGroup = {category: string; items: FaqItem[]};

// リッチテキストJSON → プレーンテキスト（JSON-LD / フォールバック表示用）
function richTextToPlain(value: string): string {
  try {
    const doc: any = JSON.parse(value);
    const walk = (node: any): string => {
      if (node?.type === 'text') return node.value ?? '';
      if (Array.isArray(node?.children))
        return node.children.map(walk).join('');
      return '';
    };
    if (Array.isArray(doc?.children)) {
      return doc.children.map(walk).join('\n').trim();
    }
    return walk(doc);
  } catch {
    return value;
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  // よくある質問は Shopify のメタオブジェクト（type: "faq"）で管理・編集する
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
    // メタオブジェクト未作成でもページは表示する
    // eslint-disable-next-line no-console
    console.error('[flow] FAQ metaobject の取得に失敗', error);
  }

  // FAQPage 構造化データ（SEO リッチリザルト対応）
  const allFaq = faqGroups.flatMap((g) => g.items);
  const seo = {
    title: 'ご利用の流れ',
    description:
      '振袖レンタルのご利用の流れ（商品検索・予約・お届け・返却）と、よくあるご質問をご案内します。',
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

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

const STEPS = [
  {
    title: '商品を探す',
    text: '「ご利用日」「着物の種類」「色」「価格」からの条件検索や、「キーワード」を直接入力しての検索が可能です。',
  },
  {
    title: '気になる商品をクリック',
    text: 'お好きな商品画像をクリックすると商品詳細ページへ移動します。価格・素材・商品説明・セット内容・対応身長・カレンダー状況などをご確認いただけます。',
  },
  {
    title: '予約にすすむ',
    text: '商品内容をご確認後「予約にすすむ」ボタンを押し、レンタルプラン・お届け日・足袋サイズを選択してカートに入れます。振袖は本番前に試着できる「下見レンタル」もご利用いただけます（下見商品での外出はご遠慮ください）。',
  },
  {
    title: '注文情報の入力',
    text: '会員登録またはログイン後、お届け先住所・お届け時間・お支払い方法を選択してご注文ください。会員登録なしでもご予約可能です。ご要望は備考欄へご記入ください。ご注文完了で自動確認メールが届きます。',
  },
  {
    title: '商品到着',
    text: '到着後はすぐに「不良箇所がないか」「ご注文内容に誤りがないか」をご確認ください。「納品書」「ご利用案内」「チェックリスト」「着払い返送用伝票（無料）」を同梱しております。最大6泊まで延長も可能です。',
  },
  {
    title: 'ご返却',
    text: 'クリーニングやアイロンは不要です。軽く畳んで、同梱の着払い伝票でご返送ください。レンタル最終日の最終集荷までにご返送手続きをお願いします。',
  },
];

const OPTIONS = [
  {
    title: '安心パック',
    price: '＋¥1,000',
    text: 'お化粧・お食事・裾などの汚れを補償する安心のオプションです。',
    img: '/images/flow/option_safepack.jpg',
  },
  {
    title: '小物レンタル',
    price: '',
    text: '髪飾りや小物を追加でレンタルいただけます。',
    img: '/images/flow/option_komono.jpg',
  },
  {
    title: '宅配下見レンタル',
    price: '',
    text: '本番前にご自宅で試着いただける下見レンタルです。',
    img: '/images/flow/option_rental.jpg',
  },
  {
    title: '振袖ご購入プラン',
    price: '＋¥10,000',
    text: '1月レンタル価格に＋¥10,000で、そのままご購入いただけます。',
    img: '/images/flow/option_buy.jpg',
  },
];

const REASONS = [
  {
    title: '老舗呉服店だから可能！正絹振袖のみをご用意',
    text: 'レンタル振袖はすべて正絹（本絹）。古典柄からモダンなデザインまで500種類以上を取り揃えております。',
    img: '/images/flow/_img_whypoint01.jpg',
  },
  {
    title: 'オンライン限定価格！正絹振袖が11,000円〜',
    text: '着付けやコーディネートサービスを省いたオンライン限定価格。正絹振袖を11,000円からご利用いただけます。',
    img: '/images/flow/_img_whypoint02.jpg',
  },
  {
    title: '毎年1000組以上のお嬢様の成人式をサポート',
    text: '毎年1000組以上のご利用実績。お電話（0721-23-1773）やお問い合わせフォームでも安心してご相談いただけます。',
    img: '/images/flow/_img_whypoint03.jpg',
  },
];

// 回答（リッチテキストJSON）を描画。JSONでなければプレーンテキストとして表示（移行時の保険）
function FaqAnswer({answer}: {answer: string}) {
  const trimmed = (answer ?? '').trim();
  if (trimmed.startsWith('{')) {
    return <RichText data={trimmed} />;
  }
  return <p className="whitespace-pre-wrap">{answer}</p>;
}

export default function Flow() {
  const {faqGroups} = useLoaderData<typeof loader>();

  return (
    <Section as="div" className="mx-auto max-w-245 sm:px-5">
      <PageHeader heading="振袖レンタルの流れ" />

      {/* ご利用の流れ 6ステップ */}
      <ol className="grid gap-4 px-6">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 items-start p-5 rounded-lg border border-primary/10 bg-gray-50"
          >
            <span className="flex shrink-0 justify-center items-center w-9 h-9 text-sm font-bold text-contrast rounded-full bg-primary">
              {i + 1}
            </span>
            <div>
              <Heading as="h2" size="copy" className="mb-1 font-bold">
                {step.title}
              </Heading>
              <Text as="p" className="text-sm text-primary/80">
                {step.text}
              </Text>
            </div>
          </li>
        ))}
      </ol>

      {/* 動画 */}
      <div className="px-6 mt-12">
        <Heading as="h2" size="lead" className="mb-4">
          動画でご紹介
        </Heading>
        <div className="overflow-hidden mx-auto rounded-lg aspect-video">
          <iframe
            className="w-full h-full"
            src="https://www.youtube.com/embed/wbXEZyu4Y7A"
            title="ご利用の流れ"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>

      {/* オプションサービス */}
      <div className="px-6 mt-14">
        <Heading as="h2" size="lead" className="mb-6 text-center">
          オプションサービス
        </Heading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {OPTIONS.map((opt) => (
            <div
              key={opt.title}
              className="overflow-hidden rounded-lg border border-primary/10"
            >
              <img
                src={opt.img}
                alt={opt.title}
                loading="lazy"
                className="object-cover w-full aspect-4/3"
              />
              <div className="p-3">
                <p className="text-sm font-bold">
                  {opt.title}
                  {opt.price && (
                    <span className="ml-1 text-primary/70">{opt.price}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-primary/70">{opt.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* お得な理由 */}
      <div className="px-6 mt-14">
        <Heading as="h2" size="lead" className="mb-6 text-center">
          KimonoYuubiがお得な理由
        </Heading>
        <div className="grid gap-8">
          {REASONS.map((r, i) => (
            <div
              key={r.title}
              className={`flex flex-col gap-4 items-center sm:flex-row ${
                i % 2 === 1 ? 'sm:flex-row-reverse' : ''
              }`}
            >
              <img
                src={r.img}
                alt={r.title}
                loading="lazy"
                className="object-cover w-full rounded-lg sm:w-1/2 aspect-video"
              />
              <div className="sm:w-1/2">
                <Heading as="h3" size="copy" className="mb-2 font-bold">
                  {r.title}
                </Heading>
                <Text as="p" className="text-sm text-primary/80">
                  {r.text}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* よくあるご質問 */}
      {faqGroups.length > 0 && (
        <div className="px-6 mt-16">
          <Heading as="h2" size="lead" className="mb-6 text-center">
            よくあるご質問
          </Heading>
          <div className="grid gap-8">
            {faqGroups.map((group) => (
              <div key={group.category}>
                <Heading
                  as="h3"
                  size="copy"
                  className="pb-2 mb-3 font-bold border-b border-primary/10"
                >
                  {group.category}
                </Heading>
                <div className="grid gap-2">
                  {group.items.map((item) => (
                    <Disclosure key={item.question}>
                      {({open}) => (
                        <div className="rounded-lg border border-primary/10">
                          <Disclosure.Button className="flex gap-3 justify-between items-center px-4 py-3 w-full text-left">
                            <span className="text-sm font-medium">
                              <span className="mr-2 text-primary/50">Q.</span>
                              {item.question}
                            </span>
                            <IconCaret
                              className={`shrink-0 transition-transform ${
                                open ? 'rotate-180' : ''
                              }`}
                            />
                          </Disclosure.Button>
                          <Disclosure.Panel className="px-4 pt-1 pb-4">
                            <div className="flex gap-2 text-sm text-primary/80">
                              <span className="font-bold shrink-0 text-primary/50">
                                A.
                              </span>
                              <div className="flex-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_a]:underline">
                                <FaqAnswer answer={item.answer} />
                              </div>
                            </div>
                          </Disclosure.Panel>
                        </div>
                      )}
                    </Disclosure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-wrap gap-4 justify-center px-6 mt-16 mb-4 md:px-0">
        <Link
          to="/contact"
          className="px-6 py-3 text-sm font-medium rounded-lg border border-primary/20"
        >
          お問い合わせはこちら
        </Link>
      </div>
    </Section>
  );
}

const FAQ_QUERY = `#graphql
  query FaqMetaobjects {
    metaobjects(type: "faq", first: 250) {
      nodes {
        fields {
          key
          value
        }
      }
    }
  }
` as const;
