import {useEffect, useRef, useState} from 'react';
import {Splide, SplideSlide} from '@splidejs/react-splide';

import type {CollectionContentFragment} from 'storefrontapi.generated';

import {Hero} from './Hero';

// モジュールレベルのフラグ。
// HMR で HeroSlider 以外のファイルが変わった場合、このモジュールは再ロードされないので
// true のまま保たれ、再マウント時に即座に Splide を描画できる。
let isClientReady = false;

type HeroSliderProps = {
  heros: CollectionContentFragment[];
  height?: 'full';
  top?: boolean;
  loading?: HTMLImageElement['loading'];
};

const heroSplideOptions = {
  type: 'loop' as const,
  perPage: 1,
  perMove: 1,
  focus: 'center' as const,
  padding: {left: '30%', right: '30%'},
  gap: '1rem',
  arrows: true,
  pagination: false,
  drag: true,
  autoplay: false,
};

export function HeroSlider({heros, height, loading, top}: HeroSliderProps) {
  // SSR は false、クライアント初回も false → useEffect で true にする。
  // HMR で他ファイルが変わった場合は isClientReady が true のまま残るため、
  // useState(isClientReady) により即座に true で初期化され、フリッカーなし。
  const [ready, setReady] = useState(isClientReady);

  const splideRef = useRef<{
    splide?: {go: (control: number | string) => void};
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (!isClientReady) {
      isClientReady = true;
      setReady(true);
    }
  }, []);

  const handleSlideChange = (_splide: unknown, newIndex: number) => {
    setActiveIndex(newIndex);
  };

  if (!heros.length) return null;

  // SSR およびクライアント初回ハイドレーション時は何も返さない（ハイドレーション不一致を防ぐ）
  if (!ready) return null;

  return (
    <>
      <Splide
        options={heroSplideOptions}
        className={[
          'hero-splide',
          height === 'full'
            ? ''
            : 'aspect-[4/5] sm:aspect-square md:aspect-[5/4] lg:aspect-[3/2] xl:aspect-[2/1]',
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
      <div className="relative pt-5 sidebar-carousel-navigation">
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
