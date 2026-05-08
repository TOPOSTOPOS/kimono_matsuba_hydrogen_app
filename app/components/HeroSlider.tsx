import {useRef, useState} from 'react';
import {Splide, SplideSlide} from '@splidejs/react-splide';

import type {CollectionContentFragment} from 'storefrontapi.generated';

import {Hero} from './Hero';

type HeroSliderProps = {
  heros: CollectionContentFragment[];
  height?: 'full';
  top?: boolean;
  loading?: HTMLImageElement['loading'];
};

// Splide の loop type は center focus + padding 構成で最低4枚必要
const LOOP_MIN_SLIDES = 4;

export function HeroSlider({heros, height, loading, top}: HeroSliderProps) {
  const useLoop = heros.length >= LOOP_MIN_SLIDES;
  const heroSplideOptions = {
    type: useLoop ? ('loop' as const) : ('slide' as const),
    rewind: !useLoop,
    perPage: 1,
    perMove: 1,
    focus: 'center' as const,
    padding: {left: '30%', right: '30%'},
    gap: '1rem',
    arrows: true,
    pagination: false,
    drag: true,
    autoplay: true,
    breakpoints: {
      640: {
        padding: {left: '10%', right: '10%'},
      },
      768: {
        arrows: false,
      },
    },
  };

  const splideRef = useRef<{
    splide?: {go: (control: number | string) => void};
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const handleSlideChange = (_splide: unknown, newIndex: number) => {
    setActiveIndex(newIndex);
  };

  if (!heros.length) return null;

  return (
    <>
      <Splide
        options={heroSplideOptions}
        className={[
          'hero-splide',
          height === 'full'
            ? ''
            : 'aspect-4/5 sm:aspect-square md:aspect-5/4 lg:aspect-3/2 xl:aspect-2/1',
        ].join(' ')}
        onMoved={handleSlideChange}
        ref={splideRef}
      >
        {heros.map((hero, index) => (
          <SplideSlide key={hero.id ?? index}>
            <Hero {...hero} height={height} top={false} loading={loading} />
          </SplideSlide>
        ))}
      </Splide>
      <div className="relative py-5 border-b sidebar-carousel-navigation border-primary/05">
        <div className="flex gap-2 justify-center items-center">
          {heros.map((hero, index) => (
            <div
              key={hero.id ?? hero.handle}
              className={`page-nation-wrapper ${
                index === activeIndex ? 'active' : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() => splideRef.current?.splide?.go(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  splideRef.current?.splide?.go(index);
                }
              }}
            >
              <span className="bullet" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
