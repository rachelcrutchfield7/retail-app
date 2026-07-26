import { Camera, Trash2 } from 'lucide-react-native';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';

type ImageUploaderProps = {
  images: string[];
  onChange: (images: string[]) => void;
  error?: string;
  uploading?: boolean;
  progress?: number;
};

const fallbackImage =
  'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80';

export function ImageUploader({ images, onChange, error, uploading = false, progress = 0 }: ImageUploaderProps) {
  const remainingSlots = Math.max(15 - images.length, 0);

  const chooseImages = () => {
    if (remainingSlots === 0) {
      return;
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []).slice(0, remainingSlots);
        const fileUris = files.map((file) => URL.createObjectURL(file));
        onChange([...images, ...fileUris]);
      };
      input.click();
      return;
    }

    onChange([...images, fallbackImage].slice(0, 15));
  };

  const removeImage = (image: string) => {
    onChange(images.filter((item) => item !== image));
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Photos</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose listing photos"
        style={[styles.uploadButton, error && styles.uploadButtonError]}
        onPress={chooseImages}
      >
        <Camera size={24} color={colors.primary} />
        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>Choose images</Text>
          <Text style={styles.uploadHint}>At least 1 required, up to 15 photos</Text>
        </View>
      </Pressable>

      {uploading ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(Math.max(progress, 0), 100)}%` }]} />
        </View>
      ) : null}

      {images.length ? (
        <View style={styles.previewGrid}>
          {images.map((image, index) => (
            <View key={`${image}-${index}`} style={styles.previewWrap}>
              <Image source={{ uri: image }} style={styles.previewImage} />
              {index === 0 ? <Text style={styles.coverBadge}>Cover</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                style={styles.removeButton}
                onPress={() => removeImage(image)}
              >
                <Trash2 size={16} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    ...typography.small,
  },
  uploadButton: {
    minHeight: 82,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  uploadButtonError: {
    borderColor: colors.error,
  },
  uploadCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  uploadTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  uploadHint: {
    color: colors.textSecondary,
    ...typography.small,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewWrap: {
    width: 92,
    height: 92,
    overflow: 'hidden',
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    color: colors.white,
    backgroundColor: colors.primary,
    ...typography.caption,
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.modalOverlay,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
}));
