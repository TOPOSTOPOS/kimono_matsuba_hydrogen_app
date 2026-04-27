import {useEffect, useMemo, useState} from 'react';
import {useFetcher, useRouteLoaderData} from '@remix-run/react';
import type {SerializeFrom} from '@remix-run/server-runtime';
import clsx from 'clsx';

import type {LatestArticleSummary} from '~/routes/($locale).api.latest-articles';
import {Text} from '~/components/Text';
import {Link} from '~/components/Link';
import {IconCaret} from '~/components/Icon';
import type {RootLoader} from '~/root';
import {usePrefixPathWithLocale} from '~/lib/utils';

const BLOG_HANDLE = 'journal';

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
  const {scene} = groupCollectionNavNodes(collectionNav?.nodes ?? []);
  return scene.length > 0 || true;
}

// ─── TypeNav data ──────────────────────────────────────────────────────────────

type TypeNavGroupItem = {
  id: string;
  title: string;
  to: string;
  items: TypeNavGroupItem[];
};

type TypeNavGroup = {
  label: string;
  items: TypeNavGroupItem[];
};

function mapNavItem(raw: any): TypeNavGroupItem {
  return {
    id: raw.id,
    title: raw.title,
    to: raw.to,
    items: Array.isArray(raw.items) ? raw.items.map(mapNavItem) : [],
  };
}

function useTypeNavGroups(): TypeNavGroup[] {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const layout = rootData?.layout;

  return useMemo(
    () => [
      {
        label: '買う',
        items: (layout?.categoryNavBuy?.items ?? []).map(mapNavItem),
      },
      {
        label: '借りる',
        items: (layout?.categoryNavRental?.items ?? []).map(mapNavItem),
      },
      {
        label: 'お手入れ',
        items: (layout?.categoryNavCleaning?.items ?? []).map(mapNavItem),
      },
    ],
    [layout],
  );
}

// ─── PC: ZOZO型マルチカラム（JS state） ───────────────────────────────────────
// flex の兄弟カラムで実装するため、h-full の問題が起きない。
// L1（子）→ L2（孫）→ L3（ひ孫）まで対応。

/**
 * 1カラム分のアイテムリスト（共通）
 * - 子なし → Link
 * - 子あり → div + ›  （クリック不可、ホバーで次カラムへ）
 * onEnter の第2引数に hovered 要素の offsetTop を渡し、flyout 位置合わせに使う
 */
const NavArrow = () => (
  <span className="shrink-0">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 32"
      width="6"
      height="20"
      role="img"
      aria-hidden="true"
      fill="#a0a0a0"
    >
      <path d="M1.867 28.533a1.867 1.867 0 0 1-1.32-3.187l9.346-9.347L.547 6.652a1.867 1.867 0 0 1 2.64-2.64l10.667 10.667a1.867 1.867 0 0 1 0 2.64L3.187 27.986a1.86 1.86 0 0 1-1.32.547z"></path>
    </svg>
  </span>
);

function NavColumn({
  items,
  activeIdx,
  onEnter,
  bg,
  showArrow = true,
}: {
  items: TypeNavGroupItem[];
  activeIdx: number | null;
  onEnter: (i: number | null, offsetTop?: number) => void;
  bg: string;
  showArrow?: boolean;
}) {
  return (
    <div className={clsx('flex flex-col shrink-0', bg)}>
      {items.map((item, i) => {
        const hasChildren = item.items.length > 0;
        const isActive = activeIdx === i;

        if (!hasChildren) {
          return (
            <Link
              key={item.id}
              to={item.to}
              prefetch="intent"
              onMouseEnter={() => onEnter(null)}
              className="px-3 py-1.5 text-sm flex items-center justify-between text-primary transition-colors duration-150 whitespace-nowrap"
            >
              <span className="text-[13px]">{item.title}</span>
              {showArrow && <NavArrow />}
            </Link>
          );
        }

        return (
          <div
            key={item.id}
            onMouseEnter={(e) =>
              onEnter(i, (e.currentTarget as HTMLDivElement).offsetTop)
            }
            className={clsx(
              'flex items-center justify-between px-3 py-1.5 text-primary cursor-default transition-colors duration-150 whitespace-nowrap select-none',
              isActive ? 'bg-primary/10' : 'hover:bg-primary/10',
            )}
          >
            <span className="text-[13px]">{item.title}</span>
            {showArrow && <NavArrow />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * トップレベル親項目（買う / 借りる / お手入れ）— PC用
 * 常時表示。ホバーで右に L2/L3 flyout を absolute で表示。
 * flyout の top はホバー行の offsetTop に合わせる。
 */
function DesktopGroupItem({
  group,
  isFooter = false,
}: {
  group: TypeNavGroup;
  isFooter?: boolean;
}) {
  const [l1, setL1] = useState<number | null>(null);
  const [l2, setL2] = useState<number | null>(null);
  const [l2Top, setL2Top] = useState(0);
  const [l3Top, setL3Top] = useState(0);

  if (!group.items.length) {
    return (
      <div className="px-2 py-2 font-semibold text-primary/80">
        {group.label}
      </div>
    );
  }

  const l2Items = l1 !== null ? group.items[l1]?.items ?? [] : [];
  const l3Items = l2 !== null ? l2Items[l2]?.items ?? [] : [];

  return (
    <div
      onMouseLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setL1(null);
          setL2(null);
        }
      }}
    >
      <div className="px-2 py-2 cursor-default select-none">
        <span className="text-base font-semibold text-primary/80">
          {group.label}
        </span>
      </div>

      {/* L1 カラム — relative で flyout の基点にする */}
      <div className="relative">
        <NavColumn
          items={group.items}
          activeIdx={l1}
          onEnter={(i, offsetTop) => {
            setL1(i);
            setL2(null);
            if (offsetTop !== undefined) setL2Top(offsetTop);
          }}
          bg={isFooter ? '#D7D2EB' : 'bg-[#fafaf9]'}
        />

        {/* L2 flyout — ホバー行の右上から absolute */}
        {l2Items.length > 0 && (
          <div
            className="absolute left-full z-10 shadow-lg"
            style={{top: `${l2Top}px`}}
          >
            <div className="relative w-[200px] py-2 bg-[#fafaf9]">
              <NavColumn
                items={l2Items}
                activeIdx={l2}
                onEnter={(i, offsetTop) => {
                  setL2(i);
                  if (offsetTop !== undefined) setL3Top(offsetTop);
                }}
                bg="bg-[#fafaf9]"
                showArrow={false}
              />

              {/* L3 flyout — L2 ホバー行の右上から absolute */}
              {l3Items.length > 0 && (
                <div
                  className="absolute left-full z-20 shadow-lg"
                  style={{top: `${l3Top}px`}}
                >
                  <NavColumn
                    items={l3Items}
                    activeIdx={null}
                    onEnter={() => {}}
                    bg="bg-[#D7D2EB]"
                    showArrow={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SP: アコーディオン ────────────────────────────────────────────────────────

function AccordionItem({
  item,
  indent = 0,
  isFooter = false,
}: {
  item: TypeNavGroupItem;
  indent?: number;
  isFooter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = item.items.length > 0;
  const pl = `${indent * 16 + 8}px`;

  if (!hasChildren) {
    return (
      <Link
        to={item.to}
        prefetch="intent"
        style={{paddingLeft: pl}}
        className={clsx(
          'block py-2 pr-2 text-sm text-primary border-b last:border-b-0 hover:opacity-60 transition-opacity',
          isFooter ? 'border-[#643e84]' : 'border-[#E0E0E0]',
        )}
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{paddingLeft: pl}}
        className={clsx(
          'w-full flex items-center justify-between py-2 pr-2 text-sm text-primary border-b hover:opacity-70 transition-opacity',
          isFooter ? 'border-[#643e84]' : 'border-[#E0E0E0]',
        )}
      >
        {item.title}
        <IconCaret direction={open ? 'up' : 'down'} />
      </button>
      {open && (
        <div>
          {item.items.map((child) => (
            <AccordionItem
              key={child.id}
              item={child}
              indent={indent + 1}
              isFooter={isFooter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccordionGroup({
  group,
  isFooter,
}: {
  group: TypeNavGroup;
  isFooter: boolean;
}) {
  return (
    <div>
      <div className="p-2 font-semibold text-primary/80">{group.label}</div>
      <div className="">
        {group.items.map((item) => (
          <AccordionItem
            key={item.id}
            item={item}
            indent={0}
            isFooter={isFooter}
          />
        ))}
      </div>
    </div>
  );
}

// ─── TypeNavSection ────────────────────────────────────────────────────────────

function TypeNavSection({
  groups,
  isFooter = false,
}: {
  groups: TypeNavGroup[];
  isFooter?: boolean;
}) {
  const hasItems = groups.some((g) => g.items.length > 0);
  if (!hasItems) return null;

  return (
    <div className="flex flex-col gap-5 w-full">
      <Text
        as="h2"
        size="fine"
        className="font-semibold text-primary/80 text-base!"
      >
        {COLLECTION_CATEGORY_METAFIELD_VALUE.TYPE}
      </Text>

      {/* PC: 常時表示 + ホバーで子をインライン展開 */}
      <div className="hidden flex-col gap-6 lg:flex">
        {groups.map((group) => (
          <DesktopGroupItem
            key={group.label}
            group={group}
            isFooter={isFooter}
          />
        ))}
      </div>

      {/* SP: タップでアコーディオン開閉 */}
      <div className="flex flex-col gap-1 lg:hidden">
        {groups.map((group) => (
          <AccordionGroup key={group.label} group={group} isFooter={isFooter} />
        ))}
      </div>
    </div>
  );
}

// ─── Articles ─────────────────────────────────────────────────────────────────

type LatestArticlesResponse = {
  articles: LatestArticleSummary[];
};

export function Nav({
  collectionNav,
  isFooter = false,
}: {
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
  isFooter?: boolean;
}) {
  const {scene} = useMemo(
    () => groupCollectionNavNodes(collectionNav?.nodes ?? []),
    [collectionNav],
  );

  const typeNavGroups = useTypeNavGroups();
  const hasTypeGroups = typeNavGroups.some((g) => g.items.length > 0);
  const hasCollections = scene.length > 0 || hasTypeGroups;

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
    <div
      className={clsx(
        'flex flex-col gap-8 justify-end items-start w-full',
        isFooter ? 'flex-row' : '',
      )}
    >
      {hasCollections && (
        <div
          className={clsx(
            'flex flex-col gap-8 justify-end items-start w-full',
            isFooter ? 'sm:flex-row' : '',
          )}
        >
          {scene.length > 0 && (
            <CollectionNavGroup
              title={COLLECTION_CATEGORY_METAFIELD_VALUE.SCENE}
              collections={scene}
              isFooter={isFooter}
            />
          )}
          {hasTypeGroups && (
            <TypeNavSection groups={typeNavGroups} isFooter={isFooter} />
          )}
        </div>
      )}

      {!isFooter && (hasArticles || articlesLoading) && (
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
            <li key={article.id} className="pb-3">
              <Link
                to={`/${BLOG_HANDLE}/${article.handle}`}
                prefetch="intent"
                className="px-2 text-[13px] line-clamp-2 hover:opacity-50 text-primary"
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
          className="text-xs underline shrink-0 underline-offset-4 text-primary"
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
  isFooter = false,
}: {
  title: string;
  collections: CollectionNavNode[];
  isFooter?: boolean;
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
      <div className="flex flex-col gap-1 w-full">
        {collections.map((item) => (
          <Link
            key={item.handle}
            to={`/collections/${item.handle}`}
            prefetch="intent"
            className={({isActive}) =>
              isActive && !isFooter
                ? '-mb-px w-full flex gap-2 items-center justify-between p-2 text-sm rounded-sm transition-colors duration-300 bg-primary/5'
                : 'w-full flex gap-2 justify-between items-center p-2 text-sm rounded-sm transition-colors duration-300 hover:bg-primary/5'
            }
          >
            <span className="text-primary">{item.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** モバイルドロワー用縦並びナビ */
export function CollectionNavStacked({
  collectionNav,
}: {
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  const {scene} = useMemo(
    () => groupCollectionNavNodes(collectionNav?.nodes ?? []),
    [collectionNav],
  );

  const typeNavGroups = useTypeNavGroups();
  const hasTypeGroups = typeNavGroups.some((g) => g.items.length > 0);

  if (!scene.length && !hasTypeGroups) {
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
      {hasTypeGroups && <TypeNavSection groups={typeNavGroups} />}
    </div>
  );
}
