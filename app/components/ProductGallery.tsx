import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {Image} from '@shopify/hydrogen';

import {IconArrow} from '~/components/Icon';
import type {MediaFragment} from 'storefrontapi.generated';

type MainVisual =
  | {kind: 'hydrogen'; data: ComponentProps<typeof Image>['data']}
  | {kind: 'img'; src: string; alt: string};

function getMainVisual(med: MediaFragment): MainVisual | null {
  if (med.__typename === 'MediaImage' && med.image?.url) {
    return {
      kind: 'hydrogen',
      data: {
        ...med.image,
        altText: med.alt || 'Product image',
      },
    };
  }
  const url = med.previewImage?.url;
  if (url) {
    return {kind: 'img', src: url, alt: med.alt || 'Product media'};
  }
  return null;
}

function getThumbUrl(med: MediaFragment): string | undefined {
  if (med.__typename === 'MediaImage' && med.image?.url) {
    return med.image.url;
  }
  return med.previewImage?.url ?? undefined;
}

/**
 * メイン画像 + 左右矢印 + 下段サムネイル（ZOZO 型の一般的な EC ギャラリー）
 */
export function ProductGallery({
  media,
  className,
}: {
  media: MediaFragment[];
  className?: string;
}) {
  const slides = useMemo(
    () => media.filter((m) => getMainVisual(m) != null),
    [media],
  );

  const mediaKey = useMemo(() => slides.map((m) => m.id).join(','), [slides]);

  const [activeIndex, setActiveIndex] = useState(0);
  const prevMediaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevMediaKeyRef.current !== mediaKey) {
      prevMediaKeyRef.current = mediaKey;
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => (slides.length ? Math.min(i, slides.length - 1) : 0));
  }, [mediaKey, slides.length]);

  const goPrev = useCallback(() => {
    if (slides.length <= 1) return;
    setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const goNext = useCallback(() => {
    if (slides.length <= 1) return;
    setActiveIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  if (!slides.length) {
    return null;
  }

  const safeIndex = Math.min(activeIndex, slides.length - 1);
  const active = slides[safeIndex];
  const visual = getMainVisual(active)!;
  const showArrows = slides.length > 1;

  return (
    <div className={className}>
      <div className="overflow-hidden relative w-full bg-white rounded-sm aspect-square card-image dark:bg-contrast/10">
        {visual.kind === 'hydrogen' ? (
          <Image
            loading="eager"
            data={visual.data}
            sizes="(min-width: 64em) 50vw, (min-width: 48em) 60vw, 90vw"
            className="object-cover size-full fadeIn"
          />
        ) : (
          <img
            src={visual.src}
            alt={visual.alt}
            className="object-cover size-full fadeIn"
            loading="eager"
            decoding="async"
          />
        )}

        {showArrows ? (
          <>
            <button
              type="button"
              aria-label="前の画像"
              className="flex absolute left-2 top-1/2 z-10 justify-center items-center rounded-full border shadow-sm backdrop-blur-sm transition-opacity -translate-y-1/2 size-10 border-primary/10 bg-contrast/90 text-primary hover:opacity-100 md:left-3"
              onClick={goPrev}
            >
              <IconArrow direction="left" />
            </button>
            <button
              type="button"
              aria-label="次の画像"
              className="flex absolute right-2 top-1/2 z-10 justify-center items-center rounded-full border shadow-sm backdrop-blur-sm transition-opacity -translate-y-1/2 size-10 border-primary/10 bg-contrast/90 text-primary hover:opacity-100 md:right-3"
              onClick={goNext}
            >
              <IconArrow direction="right" />
            </button>
          </>
        ) : null}
      </div>

      {showArrows ? (
        <div className="flex overflow-x-auto gap-2 pb-1 mt-3 hiddenScroll">
          {slides.map((med, i) => {
            const thumbUrl = getThumbUrl(med);
            if (!thumbUrl) return null;
            const selected = i === safeIndex;
            return (
              <button
                key={med.id}
                type="button"
                aria-label={`画像 ${i + 1} を表示`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => setActiveIndex(i)}
                className={`overflow-hidden relative bg-white shrink-0 size-16 dark:bg-contrast/10`}
              >
                <img
                  src={thumbUrl}
                  alt=""
                  className={` object-cover size-full ${
                    selected
                      ? 'border border-primary'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
