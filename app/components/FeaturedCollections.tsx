import {Image} from '@shopify/hydrogen';

import type {FeaturedItemsQuery} from 'storefrontapi.generated';
import {Heading, Section} from '~/components/Text';
import {Link} from '~/components/Link';

type FeaturedCollectionsProps = {
  collections: FeaturedItemsQuery['featuredCollections'];
  title?: string;
  [key: string]: unknown;
};

export function FeaturedCollections({
  collections,
  title = 'おすすめのカテゴリ',
  ...props
}: FeaturedCollectionsProps) {
  const haveCollections = collections?.nodes?.length > 0;
  if (!haveCollections) return null;

  const collectionsWithImage = collections.nodes.filter((item) => item.image);

  return (
    <Section {...props} heading={title} padding="swimlane">
      <div className="swimlane hiddenScroll md:pb-8 md:scroll-px-8 lg:scroll-px-12 md:px-0 lg:px-0">
        {collectionsWithImage.map((collection) => {
          return (
            <Link
              key={collection.id}
              to={`/collections/${collection.handle}`}
              className="snap-start w-48"
            >
              <div className="grid gap-4">
                <div className="card-image bg-primary/5 aspect-3/2">
                  {collection?.image && (
                    <Image
                      alt={`Image of ${collection.title}`}
                      data={collection.image}
                      sizes="(max-width: 32em) 100vw, 33vw"
                      aspectRatio="3/2"
                    />
                  )}
                </div>
                <Heading size="copy">{collection.title}</Heading>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
