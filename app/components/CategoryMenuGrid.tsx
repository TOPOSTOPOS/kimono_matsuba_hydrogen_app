import {useState} from 'react';

import {Link} from '~/components/Link';

export type CategoryMenuItemChild = {
  id: string;
  title: string;
  url: string;
};

export type CategoryMenuItemData = {
  id: string;
  title: string;
  url: string;
  items: CategoryMenuItemChild[];
};

export type CategoryMenuData = {
  id: string;
  items: CategoryMenuItemData[];
};

function menuItemPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function MenuItemCard({item}: {item: CategoryMenuItemData}) {
  const [open, setOpen] = useState(false);
  const hasChildren = item.items && item.items.length > 0;
  const path = menuItemPath(item.url);

  if (!hasChildren) {
    return (
      <Link
        to={path}
        prefetch="intent"
        className="block p-3 text-sm rounded border transition-colors duration-200 text-primary border-primary/10 hover:bg-primary/5"
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-primary/10">
      <div className="flex items-stretch">
        <Link
          to={path}
          prefetch="intent"
          className="flex-1 p-3 text-sm transition-colors duration-200 text-primary hover:bg-primary/5"
        >
          {item.title}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 border-l transition-colors duration-200 hover:bg-primary/5 border-primary/10"
          aria-expanded={open}
          aria-label={`${item.title}のサブカテゴリを${
            open ? '閉じる' : '開く'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-primary/10 bg-primary/5">
          {item.items.map((child) => (
            <Link
              key={child.id}
              to={menuItemPath(child.url)}
              prefetch="intent"
              className="block px-4 py-2 text-xs border-b transition-colors duration-200 text-primary/80 hover:bg-primary/10 border-primary/5 last:border-0"
            >
              {child.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryMenuGrid({
  categoriesMenu,
  sceneMenu,
}: {
  categoriesMenu: CategoryMenuData | null | undefined;
  sceneMenu: CategoryMenuData | null | undefined;
}) {
  if (!categoriesMenu && !sceneMenu) return null;

  return (
    <div className="flex flex-col gap-8 px-6 my-8 md:px-0 lg:px-0">
      {categoriesMenu && categoriesMenu.items.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-primary/80">
            種類から探す
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categoriesMenu.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      {sceneMenu && sceneMenu.items.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-primary/80">
            シーンから探す
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sceneMenu.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
