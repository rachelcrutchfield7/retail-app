import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { ListingImage } from '../../services/types';

type ListingGalleryProps = {
  images: ListingImage[];
  fallbackImage: string;
  title: string;
};

export function ListingGallery({ images, fallbackImage, title }: ListingGalleryProps) {
  const galleryImages = images.length
    ? images
    : [{ id: 'fallback', image_url: fallbackImage, sort_order: 0, created_at: '', listing_id: '' }];

  return (
    <View style={styles.gallery}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {galleryImages.map((image, index) => (
          <Image
            key={image.id}
            source={{ uri: image.image_url }}
            style={styles.image}
            accessibilityLabel={image.alt_text ?? `${title} photo ${index + 1}`}
          />
        ))}
      </ScrollView>
      <View style={styles.counter}>
        <Text style={styles.counterText}>{galleryImages.length} photo{galleryImages.length === 1 ? '' : 's'}</Text>
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  gallery: {
    height: sizes.detailImage,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  image: {
    width: 390,
    maxWidth: '100%',
    height: sizes.detailImage,
    backgroundColor: colors.primarySoft,
  },
  counter: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.modalOverlay,
  },
  counterText: {
    color: colors.white,
    ...typography.caption,
  },
}));
