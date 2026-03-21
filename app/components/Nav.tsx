import {useEffect, useMemo} from 'react';
import {useFetcher} from '@remix-run/react';
import type {SerializeFrom} from '@remix-run/server-runtime';

import type {LatestArticleSummary} from '~/routes/($locale).api.latest-articles';
import {Text} from '~/components/Text';
import {Link} from '~/components/Link';
import type {RootLoader} from '~/root';
import {usePrefixPathWithLocale} from '~/lib/utils';

/** Shopify ブログハンドル＝URL セグメント（`journal.*` ルート） */
const BLOG_HANDLE = 'journal';

/** メタフィールド `custom.collection_categories` の選択肢と一致させる */
export const COLLECTION_CATEGORY_METAFIELD_VALUE = {
  SCENE: 'シーンから探す',
  TYPE: '種類から探す',
} as const;

export type CollectionNavNode = NonNullable<
  NonNullable<SerializeFrom<RootLoader>['layout']>['collectionNav']
>['nodes'][number];

export function groupCollectionNavNodes(nodes: CollectionNavNode[]) {
  const scene: CollectionNavNode[] = [];
  const type: CollectionNavNode[] = [];

  for (const node of nodes) {
    const v = node.metafield?.value?.trim();
    if (v === COLLECTION_CATEGORY_METAFIELD_VALUE.SCENE) {
      scene.push(node);
    } else if (v === COLLECTION_CATEGORY_METAFIELD_VALUE.TYPE) {
      type.push(node);
    }
  }

  return {scene, type};
}

export function hasGroupedCollectionNav(
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'],
) {
  const {scene, type} = groupCollectionNavNodes(collectionNav?.nodes ?? []);
  return scene.length > 0 || type.length > 0;
}

type LatestArticlesResponse = {
  articles: LatestArticleSummary[];
};

export function Nav({
  collectionNav,
}: {
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  const {scene, type} = useMemo(
    () => groupCollectionNavNodes(collectionNav?.nodes ?? []),
    [collectionNav],
  );

  const hasCollections = scene.length > 0 || type.length > 0;

  const fetcher = useFetcher<LatestArticlesResponse>();
  const {load} = fetcher;
  const articlesApiPath = usePrefixPathWithLocale(
    `/api/latest-articles?count=4&blog=${BLOG_HANDLE}`,
  );

  useEffect(() => {
    load(articlesApiPath);
  }, [load, articlesApiPath]);

  const articles = fetcher.data?.articles ?? [];
  const hasArticles = articles.length > 0;
  const articlesLoading =
    fetcher.state === 'loading' ||
    (fetcher.state === 'idle' && fetcher.data === undefined);

  const fetchDone = fetcher.state === 'idle' && fetcher.data !== undefined;

  if (!hasCollections && !fetchDone && articlesLoading) {
    return (
      <div className="flex flex-col gap-8 justify-end items-start w-full">
        <NavJournalBlockSkeleton />
      </div>
    );
  }

  if (!hasCollections && fetchDone && !hasArticles) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8 justify-end items-start w-full">
      {hasCollections && (
        <div className="flex flex-col gap-8 justify-end items-start w-full">
          {scene.length > 0 && (
            <CollectionNavGroup
              title={COLLECTION_CATEGORY_METAFIELD_VALUE.SCENE}
              collections={scene}
            />
          )}
          {type.length > 0 && (
            <CollectionNavGroup
              title={COLLECTION_CATEGORY_METAFIELD_VALUE.TYPE}
              collections={type}
            />
          )}
        </div>
      )}

      {(hasArticles || articlesLoading) && (
        <NavJournalBlock
          articles={articles}
          loading={articlesLoading && !hasArticles}
        />
      )}
    </div>
  );
}

function NavJournalBlockSkeleton() {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="w-24 h-4 rounded animate-pulse bg-primary/10" />
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-full h-4 rounded animate-pulse max-w-48 bg-primary/5"
        />
      ))}
    </div>
  );
}

function NavJournalBlock({
  articles,
  loading,
}: {
  articles: LatestArticleSummary[];
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-wrap gap-2 justify-between items-baseline">
        <h2 className="text-sm font-semibold text-primary/80">
          重要なお知らせ
        </h2>
      </div>
      {loading ? (
        <NavJournalBlockSkeleton />
      ) : (
        <ul className="flex flex-col gap-1 p-0 m-0 w-full list-none">
          {articles.map((article) => (
            <li key={article.id} className="pb-3 border-b border-opacity-10">
              <Link
                to={`/${BLOG_HANDLE}/${article.handle}`}
                prefetch="intent"
                className="text-xs line-clamp-2 hover:opacity-50"
              >
                {article.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end items-end w-full">
        <Link
          to="/journal"
          className="text-xs underline shrink-0 underline-offset-4"
          prefetch="intent"
        >
          一覧を見る
        </Link>
      </div>
    </div>
  );
}

function CollectionNavGroup({
  title,
  collections,
}: {
  title: string;
  collections: CollectionNavNode[];
}) {
  return (
    <div className="flex flex-col gap-5 w-full">
      <Text
        as="h2"
        size="fine"
        className="font-semibold text-primary/80 text-base!"
      >
        {title}
      </Text>
      <div className="flex flex-col w-full">
        {collections.map((item) => (
          <Link
            key={item.handle}
            to={`/collections/${item.handle}`}
            prefetch="intent"
            className={({isActive}) =>
              isActive
                ? 'border-b -mb-px w-full rounded-sm text-sm flex gap-2 items-center justify-between px-1 py-2 transition-colors'
                : 'w-full '
            }
          >
            <span className="flex gap-2 justify-between items-center px-1 py-2 text-sm rounded-sm transition-colors hover:opacity-50">
              {item.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** モバイルドロワーなど縦並び用 */
export function CollectionNavStacked({
  collectionNav,
}: {
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  const {scene, type} = useMemo(
    () => groupCollectionNavNodes(collectionNav?.nodes ?? []),
    [collectionNav],
  );

  if (!scene.length && !type.length) {
    return null;
  }

  return (
    <div className="grid gap-6">
      {scene.length > 0 && (
        <div className="grid gap-3">
          <Text as="h3" size="fine" className="font-semibold text-primary/80">
            {COLLECTION_CATEGORY_METAFIELD_VALUE.SCENE}
          </Text>
          <div className="grid gap-2">
            {scene.map((item) => (
              <Link
                key={item.handle}
                to={`/collections/${item.handle}`}
                prefetch="intent"
                className="text-sm border-b border-[#E0E0E0] pb-3"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      {type.length > 0 && (
        <div className="grid gap-3">
          <Text as="h3" size="fine" className="font-semibold text-primary/80">
            {COLLECTION_CATEGORY_METAFIELD_VALUE.TYPE}
          </Text>
          <div className="grid gap-2">
            {type.map((item) => (
              <Link
                key={item.handle}
                to={`/collections/${item.handle}`}
                prefetch="intent"
                className="text-sm border-b border-[#E0E0E0] pb-3"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
