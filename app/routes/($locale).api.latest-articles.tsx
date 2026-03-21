import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {flattenConnection} from '@shopify/hydrogen';

/**
 * Shopify 管理画面のブログハンドル（[journal._index](app/routes/($locale).journal._index.tsx) と同じ）
 */
const DEFAULT_BLOG_HANDLE = 'journal';

const MAX_COUNT = 12;

export type LatestArticleSummary = {
  id: string;
  handle: string;
  title: string;
};

/**
 * GET ?count=4&blog=journal
 * ブログの新着記事（既定 4 件）の handle / title。
 */
export async function loader({
  request,
  context: {storefront},
}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  let count = 4;
  const c = url.searchParams.get('count');
  if (c) {
    const n = parseInt(c, 10);
    if (!Number.isNaN(n) && n > 0) {
      count = Math.min(n, MAX_COUNT);
    }
  }

  const blogHandle =
    url.searchParams.get('blog')?.trim() || DEFAULT_BLOG_HANDLE;

  const {blog} = await storefront.query(LATEST_ARTICLES_QUERY, {
    variables: {
      blogHandle,
      first: count,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheLong(),
  });

  if (!blog?.articles) {
    return json({articles: [] as LatestArticleSummary[]});
  }

  const nodes = flattenConnection(blog.articles).filter(Boolean) as Array<{
    id: string;
    handle: string;
    title: string;
  }>;
  const articles: LatestArticleSummary[] = nodes.slice(0, count).map((a) => ({
    id: a.id,
    handle: a.handle,
    title: a.title,
  }));

  return json({articles});
}

const LATEST_ARTICLES_QUERY = `#graphql
  query LatestArticles(
    $blogHandle: String!
    $first: Int!
    $language: LanguageCode
  ) @inContext(language: $language) {
    blog(handle: $blogHandle) {
      articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
        nodes {
          id
          handle
          title
        }
      }
    }
  }
` as const;

export default function LatestArticlesApiRoute() {
  return null;
}
