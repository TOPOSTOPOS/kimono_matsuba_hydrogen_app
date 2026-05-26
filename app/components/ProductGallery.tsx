import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import ReactDOM from 'react-dom';
import {Image} from '@shopify/hydrogen';
import {Splide, SplideSlide} from '@splidejs/react-splide';

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

function getImageUrl(visual: MainVisual): string {
  if (visual.kind === 'hydrogen') {
    return (visual.data as {url?: string}).url ?? '';
  }
  return visual.src;
}

function getImageAlt(visual: MainVisual): string {
  if (visual.kind === 'hydrogen') {
    return (visual.data as {altText?: string}).altText ?? '';
  }
  return visual.alt;
}

const LOOP_MIN_SLIDES = 4;

function LightboxModal({
  slides,
  startIndex,
  onClose,
}: {
  slides: MediaFragment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!mounted) return null;

  const useLoop = slides.length >= LOOP_MIN_SLIDES;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.9)',
      }}
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="閉じる"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 10000,
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          color: 'white',
          fontSize: '1.25rem',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        ✕
      </button>
      <div
        style={{width: '100%', maxWidth: '48rem', padding: '0 1rem'}}
        onClick={(e) => e.stopPropagation()}
      >
        <Splide
          key={startIndex}
          options={{
            start: startIndex,
            type: useLoop ? 'loop' : 'slide',
            rewind: !useLoop,
            perPage: 1,
            arrows: true,
            pagination: true,
            keyboard: true,
            drag: true,
            height: '80vh',
          }}
          aria-label="商品画像"
        >
          {slides.map((med) => {
            const visual = getMainVisual(med);
            if (!visual) return null;
            return (
              <SplideSlide
                key={med.id}
                style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}
              >
                <img
                  src={getImageUrl(visual)}
                  alt={getImageAlt(visual)}
                  style={{maxHeight: '80vh', maxWidth: '100%', objectFit: 'contain'}}
                  loading="lazy"
                  decoding="async"
                />
              </SplideSlide>
            );
          })}
        </Splide>
      </div>
    </div>,
    document.body,
  );
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prevMediaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevMediaKeyRef.current !== mediaKey) {
      prevMediaKeyRef.current = mediaKey;
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => (slides.length ? Math.min(i, slides.length - 1) : 0));
  }, [mediaKey, slides.length]);

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (slides.length <= 1) return;
      setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
    },
    [slides.length],
  );

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (slides.length <= 1) return;
      setActiveIndex((i) => (i + 1) % slides.length);
    },
    [slides.length],
  );

  const openLightbox = useCallback(() => {
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  if (!slides.length) {
    return null;
  }

  const safeIndex = Math.min(activeIndex, slides.length - 1);
  const active = slides[safeIndex];
  const visual = getMainVisual(active)!;
  const showArrows = slides.length > 1;

  return (
    <div className={className}>
      {/* 画像エリア全体: div で onClick を受け取る */}
      <div
        className="overflow-hidden relative w-full bg-white rounded-none! aspect-square card-image"
        onClick={openLightbox}
        role="button"
        tabIndex={0}
        aria-label="画像を拡大表示"
        style={{cursor: 'zoom-in'}}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openLightbox();
        }}
      >
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
                className={`overflow-hidden relative bg-white shrink-0 size-16`}
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

      {lightboxOpen && (
        <LightboxModal
          slides={slides}
          startIndex={safeIndex}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
