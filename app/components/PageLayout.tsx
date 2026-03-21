import type {SerializeFrom} from '@remix-run/server-runtime';
import {ReactNode} from 'react';

import {type LayoutQuery} from 'storefrontapi.generated';
import {type EnhancedMenu} from '~/lib/utils';
import type {RootLoader} from '~/root';

import {Footer} from './Footer';
import {Header} from './Header';

type LayoutProps = {
  children: React.ReactNode;
  layout?: SerializeFrom<RootLoader>['layout'] & {
    headerMenu?: EnhancedMenu | null;
    footerMenu?: EnhancedMenu | null;
  };
};

export function PageLayout({children, layout}: LayoutProps) {
  const {headerMenu, footerMenu} = layout || {};
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <div className="">
          <a href="#mainContent" className="sr-only">
            Skip to content
          </a>
        </div>
        {headerMenu && layout?.shop.name && (
          <Header
            title={layout.shop.name}
            menu={headerMenu}
            collectionNav={layout.collectionNav}
          />
        )}
        <main role="main" id="mainContent" className="grow">
          {children}
        </main>
      </div>
      {footerMenu && <Footer menu={footerMenu} />}
    </>
  );
}
