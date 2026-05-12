import type {ComponentProps} from 'react';

import type {ProductCardFragment} from 'storefrontapi.generated';
import {Section} from '~/components/Text';
import {ProductCard} from '~/components/ProductCard';

export type ProductSwimlaneProducts = {
  nodes: ProductCardFragment[];
};

type ProductSwimlaneProps = {
  title?: string;
  count?: number;
  products?: ProductSwimlaneProducts;
} & Omit<ComponentProps<typeof Section>, 'heading' | 'children'>;

export function ProductSwimlane({
  title = 'おすすめ商品',
  products,
  count = 12,
  ...props
}: ProductSwimlaneProps) {
  const nodes = products?.nodes ?? [];
  const visible = nodes.slice(0, count);

  if (visible.length === 0) {
    return null;
  }

  return (
    <Section heading={title} padding="y" {...props}>
      <div className="swimlane hiddenScroll md:pb-8 md:scroll-px-8 lg:scroll-px-12">
        {visible.map((product) => (
          <ProductCard
            product={product}
            key={product.id}
            className="w-48 snap-start"
          />
        ))}
      </div>
    </Section>
  );
}
