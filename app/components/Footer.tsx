import {Disclosure} from '@headlessui/react';
import {Suspense} from 'react';
import {SocialIcon} from 'react-social-icons';

import {Heading, Section} from '~/components/Text';
import {Link} from '~/components/Link';
import {CountrySelector} from '~/components/CountrySelector';
import {IconCaret} from '~/components/Icon';
import {
  type EnhancedMenu,
  type ChildEnhancedMenuItem,
  useIsHomePath,
} from '~/lib/utils';

import {Icons} from './elements/Icons';

export function Footer({menu}: {menu?: EnhancedMenu}) {
  const isHome = useIsHomePath();
  const itemsCount = menu
    ? menu?.items?.length + 1 > 4
      ? 4
      : menu?.items?.length + 1
    : [];

  return (
    <Section
      divider={isHome ? 'none' : 'top'}
      as="footer"
      role="contentinfo"
      className={`grid overflow-hidden grid-cols-1 grid-flow-row gap-6 items-start px-6 py-8 w-full bg-white min-h-100 md:px-8 lg:px-12 md:gap-8 lg:gap-12 md:grid-cols-2 lg:grid-cols-${itemsCount} dark:bg-contrast dark:text-primary text-contrast`}
    >
      <FooterMenu menu={menu} />
      <div className="hidden">
        <CountrySelector />
      </div>

      <FooterSns />

      <div
        className={`flex justify-between self-end pt-8 w-full text-primary md:col-span-4 lg:col-span-${itemsCount}`}
      >
        {/* <p>aaa</p> */}
        <p className="">
          <Icons.Logo className="w-[148px] h-auto" fill="black" />
        </p>
      </div>
    </Section>
  );
}

function FooterLink({item}: {item: ChildEnhancedMenuItem}) {
  if (item.to.startsWith('http')) {
    return (
      <a href={item.to} target={item.target} rel="noopener noreferrer">
        {item.title}
      </a>
    );
  }

  return (
    <Link to={item.to} target={item.target} prefetch="intent">
      {item.title}
    </Link>
  );
}

function FooterMenu({menu}: {menu?: EnhancedMenu}) {
  const styles = {
    section: 'grid gap-4 text-primary',
    nav: 'grid gap-2 pb-6 text-primary',
  };

  return (
    <>
      {(menu?.items || []).map((item) => (
        <section key={item.id} className={styles.section}>
          <Disclosure>
            {({open}) => (
              <>
                <Disclosure.Button className="text-left md:cursor-default">
                  <Heading className="flex justify-between" size="lead" as="h3">
                    {item.title}
                    {item?.items?.length > 0 && (
                      <span className="md:hidden">
                        <IconCaret direction={open ? 'up' : 'down'} />
                      </span>
                    )}
                  </Heading>
                </Disclosure.Button>
                {item?.items?.length > 0 ? (
                  <div
                    className={`${
                      open ? `max-h-48 h-fit` : `max-h-0 md:max-h-fit`
                    } overflow-hidden transition-all duration-300`}
                  >
                    <Suspense data-comment="This suspense fixes a hydration bug in Disclosure.Panel with static prop">
                      <Disclosure.Panel static>
                        <nav className={styles.nav}>
                          {item.items.map((subItem: ChildEnhancedMenuItem) => (
                            <FooterLink key={subItem.id} item={subItem} />
                          ))}
                        </nav>
                      </Disclosure.Panel>
                    </Suspense>
                  </div>
                ) : null}
              </>
            )}
          </Disclosure>
        </section>
      ))}
    </>
  );
}

function FooterSns() {
  const snsMenu = [
    {
      id: 'snsItem1',
      icon: (
        <SocialIcon
          url="https://www.instagram.com/"
          network="instagram"
          bgColor="#232323"
          target="_blank"
          style={{
            width: '1.5rem',
            height: '1.5rem',
          }}
        />
      ),
      path: '/',
    },
    {
      id: 'snsItem2',
      icon: (
        <SocialIcon
          url="https://x.com/"
          network="x"
          bgColor="#232323"
          target="_blank"
          style={{
            width: '1.5rem',
            height: '1.5rem',
          }}
        />
      ),
      path: '/',
    },
    {
      id: 'snsItem3',
      icon: (
        <SocialIcon
          url="https://www.tiktok.com/"
          network="tiktok"
          bgColor="#232323"
          target="_blank"
          style={{
            width: '1.5rem',
            height: '1.5rem',
          }}
        />
      ),
      path: '/',
    },
    {
      id: 'snsItem4',
      icon: (
        <SocialIcon
          url="https://www.youtube.com/"
          network="youtube"
          bgColor="#232323"
          target="_blank"
          style={{
            width: '1.5rem',
            height: '1.5rem',
          }}
        />
      ),
      path: '/',
    },
    {
      id: 'snsItem5',
      icon: (
        <SocialIcon
          url="https://www.facebook.com/"
          network="facebook"
          bgColor="#232323"
          target="_blank"
          style={{
            width: '1.5rem',
            height: '1.5rem',
          }}
        />
      ),
      path: '/',
    },
  ];
  return (
    <section className="grid gap-4 w-full text-primary">
      <h3 className="max-w-prose font-bold whitespace-pre-wrap cursor-default text-lead">
        SNS
      </h3>
      <div className="flex overflow-hidden gap-2 max-h-0 transition-all duration-300 md:max-h-fit">
        {snsMenu.length &&
          snsMenu.map((snsItem) => {
            return <div key={snsItem.id}>{snsItem.icon}</div>;
          })}
      </div>
    </section>
  );
}
