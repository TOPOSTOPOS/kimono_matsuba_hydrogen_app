import {useParams, Form, Await, useRouteLoaderData} from '@remix-run/react';
import useWindowScroll from 'react-use/esm/useWindowScroll';
import {Suspense, useEffect, useMemo} from 'react';
import {CartForm} from '@shopify/hydrogen';
import type {SerializeFrom} from '@remix-run/server-runtime';

import {Text, Heading} from '~/components/Text';
import {Link} from '~/components/Link';
import {Cart} from '~/components/Cart';
import {CartLoading} from '~/components/CartLoading';
import {Input} from '~/components/Input';
import {Drawer, useDrawer} from '~/components/Drawer';
import {
  IconMenu,
  IconLogin,
  IconAccount,
  IconBag,
  IconSearch,
} from '~/components/Icon';
import {type EnhancedMenu, useIsHomePath} from '~/lib/utils';
import {useIsHydrated} from '~/hooks/useIsHydrated';
import {useCartFetchers} from '~/hooks/useCartFetchers';
import type {RootLoader} from '~/root';
import {
  CollectionNavStacked,
  Nav,
  hasGroupedCollectionNav,
} from '~/components/Nav';

import {Icons} from './elements/Icons';
import {Button} from './Button';

export function Header({
  title,
  menu,
  collectionNav,
}: {
  title: string;
  menu?: EnhancedMenu;
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  const isHome = useIsHomePath();

  const {
    isOpen: isCartOpen,
    openDrawer: openCart,
    closeDrawer: closeCart,
  } = useDrawer();

  const {
    isOpen: isMenuOpen,
    openDrawer: openMenu,
    closeDrawer: closeMenu,
  } = useDrawer();

  const addToCartFetchers = useCartFetchers(CartForm.ACTIONS.LinesAdd);

  // toggle cart drawer when adding to cart
  useEffect(() => {
    if (isCartOpen || !addToCartFetchers.length) return;
    openCart();
  }, [addToCartFetchers, isCartOpen, openCart]);

  return (
    <>
      <CartDrawer isOpen={isCartOpen} onClose={closeCart} />
      {menu && (
        <MenuDrawer
          isOpen={isMenuOpen}
          onClose={closeMenu}
          menu={menu}
          collectionNav={collectionNav}
        />
      )}
      <DesktopHeader
        isHome={isHome}
        title={title}
        menu={menu}
        collectionNav={collectionNav}
        openCart={openCart}
      />
      <MobileHeader
        isHome={isHome}
        title={title}
        openCart={openCart}
        openMenu={openMenu}
      />
    </>
  );
}

function CartDrawer({isOpen, onClose}: {isOpen: boolean; onClose: () => void}) {
  const rootData = useRouteLoaderData<RootLoader>('root');
  if (!rootData) return null;

  return (
    <Drawer open={isOpen} onClose={onClose} heading="カート" openFrom="right">
      <div className="grid">
        <Suspense fallback={<CartLoading />}>
          <Await resolve={rootData?.cart}>
            {(cart) => <Cart layout="drawer" onClose={onClose} cart={cart} />}
          </Await>
        </Suspense>
      </div>
    </Drawer>
  );
}

export function MenuDrawer({
  isOpen,
  onClose,
  menu,
  collectionNav,
}: {
  isOpen: boolean;
  onClose: () => void;
  menu: EnhancedMenu;
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  return (
    <Drawer open={isOpen} onClose={onClose} openFrom="left" heading="Menu">
      <div className="grid">
        <MenuMobileNav
          menu={menu}
          onClose={onClose}
          collectionNav={collectionNav}
        />
      </div>
    </Drawer>
  );
}

function MenuMobileNav({
  menu,
  onClose,
  collectionNav,
}: {
  menu: EnhancedMenu;
  onClose: () => void;
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
}) {
  return (
    <nav className="grid overflow-y-auto gap-4 px-6 py-4 h-screen-no-nav sm:gap-6 sm:px-8 sm:py-4">
      {hasGroupedCollectionNav(collectionNav) && (
        <div className="pb-2 border-b border-[#E0E0E0]">
          <CollectionNavStacked collectionNav={collectionNav} />
        </div>
      )}
      {/* Top level menu items */}
      {(menu?.items || []).map((item) => (
        <span key={item.id} className="block">
          <Link
            to={item.to}
            target={item.target}
            onClick={onClose}
            className={({isActive}) =>
              isActive ? 'pb-1 border-b -mb-px' : 'pb-1'
            }
          >
            <Text
              as="span"
              size="copy"
              className="flex justify-between items-center text-sm border-b border-[#E0E0E0] pb-4"
            >
              <span className="text-sm">{item.title}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 14 32"
                width="24"
                height="24"
                role="img"
                aria-hidden="true"
                className="w-4 h-4"
              >
                <path d="M1.867 28.533a1.867 1.867 0 0 1-1.32-3.187l9.346-9.347L.547 6.652a1.867 1.867 0 0 1 2.64-2.64l10.667 10.667a1.867 1.867 0 0 1 0 2.64L3.187 27.986a1.86 1.86 0 0 1-1.32.547z"></path>
              </svg>
            </Text>
          </Link>
        </span>
      ))}
      <Button to="https://hon-matsuba.co.jp/" variant="primary" target="_blank">
        来店予約
      </Button>
    </nav>
  );
}

function MobileHeader({
  title,
  isHome,
  openCart,
  openMenu,
}: {
  title: string;
  isHome: boolean;
  openCart: () => void;
  openMenu: () => void;
}) {
  // useHeaderStyleFix(containerStyle, setContainerStyle, isHome);

  const params = useParams();

  return (
    <header
      role="banner"
      className={`${
        isHome ? 'text-black bg-white shadow-darkHeader' : 'text-primary'
      } flex lg:hidden items-center sticky backdrop-blur-lg z-40 top-0 justify-between w-full leading-none gap-4 px-4 md:px-8`}
    >
      <div className="flex gap-2 justify-start items-center w-full">
        <button
          onClick={openMenu}
          className="flex relative justify-center items-center w-8 h-8"
        >
          <IconMenu />
        </button>
        <Form
          method="get"
          action={params.locale ? `/${params.locale}/search` : '/search'}
          className="gap-2 items-center sm:flex"
        >
          <button
            type="submit"
            className="flex relative justify-center items-center w-8 h-8"
          >
            <IconSearch />
          </button>
          <Input
            className={
              isHome ? 'focus:border-contrast/20' : 'focus:border-primary/20'
            }
            type="search"
            variant="minisearch"
            placeholder="検索"
            name="q"
          />
        </Form>
      </div>

      <Link
        className="flex justify-center items-center self-stretch py-4 w-full h-full leading-12 md:leading-16 grow"
        to="/"
      >
        <Heading
          className="font-bold leading-none text-center"
          as={isHome ? 'h1' : 'h2'}
        >
          <Icons.Logo
            className="w-[112px] h-auto"
            fill={isHome ? 'white' : 'black'}
          />
        </Heading>
      </Link>

      <div className="flex gap-2 justify-end items-center w-full">
        <AccountLink className="flex relative justify-center items-center w-8 h-8" />
        <CartCount isHome={isHome} openCart={openCart} />
      </div>
    </header>
  );
}

function DesktopHeader({
  isHome,
  menu,
  collectionNav,
  openCart,
  title,
}: {
  isHome: boolean;
  openCart: () => void;
  menu?: EnhancedMenu;
  collectionNav?: SerializeFrom<RootLoader>['layout']['collectionNav'];
  title: string;
}) {
  const params = useParams();
  const {y} = useWindowScroll();
  return (
    <>
      <header
        role="banner"
        className={`bg-[#D7D2EB] shadow-sm ${
          isHome ? 'text-black' : 'text-primary'
        } ${
          !isHome && y > 50 && ' shadow-lightHeader'
        } hidden lg:flex lg:flex-col items-end sticky transition duration-300 backdrop-blur-lg z-40 top-0 justify-between w-full leading-none gap-4 py-4 `}
      >
        <div className="flex justify-between items-center w-full max-w-[980px] mx-auto">
          <h1
            className={`${
              isHome ? 'text-black' : 'text-black'
            } text-[.75rem] sr-only`}
          >
            着物レンタルモールhataori(ハタオリ)
          </h1>
          <div className="">
            <Link className="font-bold" to="/" prefetch="intent">
              <Icons.Logo
                className="w-[160px] h-8 flex-1 sml:h-5 sml:w-auto sml:flex-none"
                fill={isHome ? 'black' : 'black'}
              />
            </Link>
          </div>

          <div className="flex gap-1 items-center">
            <Form
              method="get"
              action={params.locale ? `/${params.locale}/search` : '/search'}
              className="flex gap-2 items-center"
            >
              <Input
                className={
                  isHome
                    ? 'focus:border-contrast/20'
                    : 'focus:border-primary/20'
                }
                type="search"
                variant="minisearch"
                placeholder="検索"
                name="q"
              />
              <button
                type="submit"
                className="flex relative justify-center items-center w-8 h-8 focus:ring-primary/5"
              >
                <IconSearch />
              </button>
            </Form>
            <AccountLink className="flex relative justify-center items-center w-8 h-8 focus:ring-primary/5" />
            <CartCount isHome={isHome} openCart={openCart} />
          </div>
        </div>
      </header>
      {isHome && (
        <nav className="justify-end items-center hidden gap-8 w-full lg:max-w-[980px] mx-auto text-sm py-5 sm:flex ">
          {(menu?.items || []).map((item) => (
            <Link
              key={item.id}
              to={item.to}
              target={item.target}
              prefetch="intent"
              className={({isActive}) =>
                isActive ? 'pb-1 border-b -mb-px' : 'pb-1'
              }
            >
              {item.title}
            </Link>
          ))}
          <Button
            to="https://hon-matsuba.co.jp/"
            variant="primary"
            target="_blank"
          >
            来店予約
          </Button>
        </nav>
      )}
    </>
  );
}

function AccountLink({className}: {className?: string}) {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const isLoggedIn = rootData?.isLoggedIn;

  return (
    <Link to="/account" className={className}>
      <Suspense fallback={<IconLogin />}>
        <Await resolve={isLoggedIn} errorElement={<IconLogin />}>
          {(isLoggedIn) => (isLoggedIn ? <IconAccount /> : <IconLogin />)}
        </Await>
      </Suspense>
    </Link>
  );
}

function CartCount({
  isHome,
  openCart,
}: {
  isHome: boolean;
  openCart: () => void;
}) {
  const rootData = useRouteLoaderData<RootLoader>('root');
  if (!rootData) return null;

  return (
    <Suspense fallback={<Badge count={0} dark={isHome} openCart={openCart} />}>
      <Await resolve={rootData?.cart}>
        {(cart) => (
          <Badge
            dark={isHome}
            openCart={openCart}
            count={cart?.totalQuantity || 0}
          />
        )}
      </Await>
    </Suspense>
  );
}

function Badge({
  openCart,
  dark,
  count,
}: {
  count: number;
  dark: boolean;
  openCart: () => void;
}) {
  const isHydrated = useIsHydrated();

  const BadgeCounter = useMemo(
    () => (
      <>
        <IconBag />
        <div
          className={`${
            dark ? 'text-primary bg-contrast' : 'text-contrast bg-primary'
          } absolute bottom-1 right-1 text-[0.625rem] font-medium subpixel-antialiased h-3 min-w-3 flex items-center justify-center leading-none text-center rounded-full w-auto px-0.5 pb-px`}
        >
          <span>{count || 0}</span>
        </div>
      </>
    ),
    [count, dark],
  );

  return isHydrated ? (
    <button
      onClick={openCart}
      className="flex relative justify-center items-center w-8 h-8 focus:ring-primary/5"
    >
      {BadgeCounter}
    </button>
  ) : (
    <Link
      to="/cart"
      className="flex relative justify-center items-center w-8 h-8 focus:ring-primary/5"
    >
      {BadgeCounter}
    </Link>
  );
}
