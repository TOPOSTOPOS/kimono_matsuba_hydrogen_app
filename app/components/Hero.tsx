import clsx from 'clsx';
import {MediaFile} from '@shopify/hydrogen';
import type {
  MediaImage,
  Media,
  Video as MediaVideo,
} from '@shopify/hydrogen/storefront-api-types';

import type {CollectionContentFragment} from 'storefrontapi.generated';
import {Heading, Text} from '~/components/Text';
import {Link} from '~/components/Link';

type HeroProps = CollectionContentFragment & {
  height?: 'full';
  top?: boolean;
  loading?: HTMLImageElement['loading'];
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
  return (
    <Link to={`/collections/${handle}`} prefetch="viewport">
      <section
        className={clsx(
          'relative justify-end flex flex-col w-full overflow-hidden rounded-lg shadow-lg my-3',
          height === 'full'
            ? 'h-auto sm:aspect-auto aspect-3/2'
            : 'aspect-4/5 sm:aspect-square md:aspect-5/4 lg:aspect-3/2 xl:aspect-2/1',
        )}
      >
        <div className="w-full h-auto sm:aspect-auto aspect-3/2">
          <SpreadMedia
            sizes="100vw"
            className="object-cover w-full h-full sm:aspect-auto aspect-3/2"
            data={spread?.reference as Media | MediaImage | MediaVideo}
            loading={loading}
          />
        </div>
        <div className="flex absolute bottom-0 left-0 flex-col gap-2 justify-between items-baseline px-3 py-5 w-full bg-linear-to-t sm:gap-4 sm:px-6 md:px-8 from-primary/60 text-contrast">
          {heading?.value && (
            <Heading
              format
              as="h2"
              size="display"
              className="max-w-lg text-lg sm:text-[23px]!"
            >
              {heading.value}
            </Heading>
          )}
          {byline?.value && (
            <Text
              format
              width="narrow"
              as="p"
              size="lead"
              className="text-sm sm:text-base"
            >
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
  className?: string;
};

function SpreadMedia({data, loading, sizes, className}: SpreadMediaProps) {
  if (!data) return null;
  return (
    <MediaFile
      data={data}
      className={clsx('block object-cover w-full h-auto', className)}
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
