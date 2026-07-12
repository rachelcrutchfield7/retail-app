import { X } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, sizes, spacing } from '../../constants/theme';

type ImagePreviewProps = {
  imageUri?: string | null;
  onRemove: () => void;
};

export function ImagePreview({ imageUri, onRemove }: ImagePreviewProps) {
  if (!imageUri) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Image source={{ uri: imageUri }} style={styles.image} />
      <Pressable accessibilityRole="button" accessibilityLabel="Remove image" onPress={onRemove} style={styles.remove}>
        <X size={16} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    width: 96,
    height: 96,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  remove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: sizes.touchTarget - 14,
    height: sizes.touchTarget - 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.modalOverlay,
  },
});
