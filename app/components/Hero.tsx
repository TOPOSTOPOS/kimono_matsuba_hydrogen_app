import clsx from 'clsx';
import {MediaFile} from '@shopify/hydrogen';
import type {
  MediaImage,
  Media,
  Video as MediaVideo,
} from '@shopify/hydrogen/storefront-api-types';
import {Splide, SplideSlide} from '@splidejs/react-splide';
import '@splidejs/splide/css';

import type {CollectionContentFragment} from 'storefrontapi.generated';
import {Heading, Text} from '~/components/Text';
import {Link} from '~/components/Link';

type HeroProps = CollectionContentFragment & {
  height?: 'full';
  top?: boolean;
  loading?: HTMLImageElement['loading'];
};

const heroSplideOptions = {
  type: 'loop' as const,
  perPage: 1,
  perMove: 1,
  focus: 'center' as const,
  padding: {left: '8%', right: '8%'},
  gap: '1rem',
  arrows: true,
  pagination: true,
  drag: true,
  autoplay: false,
};

/**
 * Hero component that renders metafields attached to collection resources.
 * Uses Splide slider with overflow peek on both ends.
 **/
export function Hero({
  byline,
  cta,
  handle,
  heading,
  height,
  loading,
  spread,
  spreadSecondary,
  top,
}: HeroProps) {
  const slides = [spread?.reference, spreadSecondary?.reference].filter(
    Boolean,
  ) as Media[];

  return (
    <Link to={`/collections/${handle}`} prefetch="viewport">
      <section
        className={clsx(
          'relative justify-end flex flex-col w-full overflow-hidden',
          top && '-mt-nav',
          height === 'full'
            ? 'h-screen'
            : 'aspect-[4/5] sm:aspect-square md:aspect-[5/4] lg:aspect-[3/2] xl:aspect-[2/1]',
        )}
      >
        <div className="">
          {slides.length > 0 ? (
            <Splide
              options={heroSplideOptions}
              className="hero-splide !absolute !inset-0"
            >
              {slides.map((media, index) => (
                <SplideSlide key={(media as {id?: string}).id ?? index}>
                  <div className="w-full h-full">
                    <SpreadMedia
                      sizes={
                        slides.length > 1
                          ? '(min-width: 48em) 50vw, 100vw'
                          : '100vw'
                      }
                      data={media}
                      loading={loading}
                    />
                  </div>
                </SplideSlide>
              ))}
            </Splide>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 justify-between items-baseline px-6 py-8 bg-gradient-to-t sm:px-8 md:px-12 dark:from-contrast/60 dark:text-primary from-primary/60 text-contrast">
          {heading?.value && (
            <Heading format as="h2" size="display" className="max-w-md">
              {heading.value}
            </Heading>
          )}
          {byline?.value && (
            <Text format width="narrow" as="p" size="lead">
              {byline.value}
            </Text>
          )}
          {cta?.value && <Text size="lead">{cta.value}</Text>}
        </div>
      </section>
    </Link>
  );
}

type SpreadMediaProps = {
  data: Media | MediaImage | MediaVideo;
  loading?: HTMLImageElement['loading'];
  sizes: string;
};

function SpreadMedia({data, loading, sizes}: SpreadMediaProps) {
  return (
    <MediaFile
      data={data}
      className="block object-cover w-full h-full"
      mediaOptions={{
        video: {
          controls: false,
          muted: true,
          loop: true,
          playsInline: true,
          autoPlay: true,
          previewImageOptions: {src: data.previewImage?.url ?? ''},
        },
        image: {
          loading,
          crop: 'center',
          sizes,
          alt: data.alt || '',
        },
      }}
    />
  );
}
