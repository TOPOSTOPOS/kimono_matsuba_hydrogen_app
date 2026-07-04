import {json} from '@shopify/remix-oxygen';
import type {
  ActionFunctionArgs,
  MetaArgs,
  LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {Form, useActionData, useNavigation} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';

import {PageHeader, Section, Text} from '~/components/Text';
import {Button} from '~/components/Button';
import {getInputStyleClasses} from '~/lib/utils';
import {routeHeaders} from '~/data/cache';
import {sendContactEmail, type ContactInput} from '~/lib/contact.server';

export const headers = routeHeaders;

export async function loader({request}: LoaderFunctionArgs) {
  const seo = {
    title: 'お問い合わせ',
    description:
      '本きもの松葉へのお問い合わせはこちらのフォームからお送りください。',
    url: request.url,
  };
  return json({seo});
}

export const meta = ({matches}: MetaArgs<typeof loader>) => {
  return getSeoMeta(...matches.map((match) => (match.data as any).seo));
};

type FieldName = keyof ContactInput;

type ActionData = {
  ok?: boolean;
  formError?: string;
  errors?: Partial<Record<FieldName, string>>;
  values?: Partial<Record<FieldName, string>>;
};

// ひらがな・カタカナ・長音・半角スペースのみ（全角スペースは検証前に半角へ正規化）
const KANA_RE = /^[぀-ヿ\s]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9\-+()\s]{8,20}$/;

export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const get = (k: FieldName) =>
    (formData.get(k) as string | null)?.trim() ?? '';

  const values: Record<FieldName, string> = {
    name: get('name'),
    furigana: get('furigana'),
    phone: get('phone'),
    email: get('email'),
    message: get('message'),
  };

  const errors: Partial<Record<FieldName, string>> = {};
  if (!values.name) errors.name = 'お名前を入力してください。';
  if (!values.furigana) {
    errors.furigana = 'ふりがなを入力してください。';
  } else if (!KANA_RE.test(values.furigana)) {
    errors.furigana = 'ふりがなは、ひらがな・カタカナで入力してください。';
  }
  if (!values.phone) {
    errors.phone = '電話番号を入力してください。';
  } else if (!PHONE_RE.test(values.phone)) {
    errors.phone = '電話番号を正しく入力してください。';
  }
  if (!values.email) {
    errors.email = 'メールアドレスを入力してください。';
  } else if (!EMAIL_RE.test(values.email)) {
    errors.email = 'メールアドレスを正しく入力してください。';
  }
  if (!values.message) errors.message = 'お問い合わせ内容を入力してください。';

  if (Object.keys(errors).length > 0) {
    return json<ActionData>({errors, values}, {status: 400});
  }

  const result = await sendContactEmail(context.env, values);
  if (!result.ok) {
    return json<ActionData>(
      {
        formError:
          '送信中にエラーが発生しました。お手数ですが、時間をおいて再度お試しください。',
        values,
      },
      {status: 500},
    );
  }

  return json<ActionData>({ok: true});
}

function FieldError({message}: {message?: string}) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function RequiredMark() {
  return <span className="ml-1 text-red-500">※</span>;
}

export default function Contact() {
  const actionData = useActionData<typeof action>();
  const {state} = useNavigation();
  const isSubmitting = state === 'submitting';
  const errors = actionData?.errors ?? {};
  const values = actionData?.values ?? {};

  if (actionData?.ok) {
    return (
      <Section as="div" className="mx-auto max-w-2xl">
        <PageHeader heading="お問い合わせ" />
        <div className="px-6 pb-16 md:px-0">
          <div className="p-6 text-center rounded-lg border border-primary/10 bg-gray-50">
            <p className="text-lg font-bold">送信が完了しました。</p>
            <Text className="mt-3" as="p">
              お問い合わせいただきありがとうございます。
              <br />
              担当者より折り返しご連絡いたしますので、少々お待ちください。
            </Text>
            <div className="mt-6">
              <Button to="/" variant="secondary">
                トップへ戻る
              </Button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section as="div" className="mx-auto max-w-2xl">
      <PageHeader heading="お問い合わせ">
        <Text as="p" className="text-primary/70">
          下記フォームに必要事項をご記入のうえ、送信してください。
          <span className="ml-1 text-red-500">※</span>は必須項目です。
        </Text>
      </PageHeader>

      <div className="px-6 pb-16 md:px-0">
        {actionData?.formError && (
          <div className="p-4 mb-6 text-sm text-red-900 bg-red-100 rounded-sm">
            {actionData.formError}
          </div>
        )}

        <Form method="post" noValidate className="grid gap-6">
          <div>
            <label htmlFor="name" className="block mb-1 text-sm font-medium">
              お名前
              <RequiredMark />
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              defaultValue={values.name ?? ''}
              className={getInputStyleClasses(errors.name)}
            />
            <FieldError message={errors.name} />
          </div>

          <div>
            <label
              htmlFor="furigana"
              className="block mb-1 text-sm font-medium"
            >
              ふりがな
              <RequiredMark />
            </label>
            <input
              id="furigana"
              name="furigana"
              type="text"
              placeholder="ほんきもの まつば"
              required
              defaultValue={values.furigana ?? ''}
              className={getInputStyleClasses(errors.furigana)}
            />
            <FieldError message={errors.furigana} />
          </div>

          <div>
            <label htmlFor="phone" className="block mb-1 text-sm font-medium">
              電話番号
              <RequiredMark />
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="03-1234-5678"
              required
              defaultValue={values.phone ?? ''}
              className={getInputStyleClasses(errors.phone)}
            />
            <FieldError message={errors.phone} />
          </div>

          <div>
            <label htmlFor="email" className="block mb-1 text-sm font-medium">
              メールアドレス
              <RequiredMark />
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="example@example.com"
              required
              defaultValue={values.email ?? ''}
              className={getInputStyleClasses(errors.email)}
            />
            <FieldError message={errors.email} />
          </div>

          <div>
            <label htmlFor="message" className="block mb-1 text-sm font-medium">
              お問い合わせ内容
              <RequiredMark />
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              required
              defaultValue={values.message ?? ''}
              className={getInputStyleClasses(errors.message)}
            />
            <FieldError message={errors.message} />
          </div>

          <div className="mt-2">
            <Button type="submit" width="full" disabled={isSubmitting}>
              {isSubmitting ? '送信中…' : '送信する'}
            </Button>
          </div>
        </Form>
      </div>
    </Section>
  );
}
