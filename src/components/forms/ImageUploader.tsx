import { Camera, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type ImageUploaderProps = {
  images: string[];
  onChange: (images: string[]) => void;
  error?: string;
  uploading?: boolean;
  progress?: number;
};

const pickerSupportedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function normalizedPickerMimeType(mimeType?: string | null): string {
  const normalized = mimeType?.toLowerCase();
  return normalized && pickerSupportedMimeTypes.has(normalized)
    ? normalized.replace('image/jpg', 'image/jpeg')
    : 'image/jpeg';
}

export function ImageUploader({ images, onChange, error, uploading = false, progress = 0 }: ImageUploaderProps) {
  const themeColors = useThemeColors();
  const [pickerError, setPickerError] = useState<string | null>(null);
  const remainingSlots = Math.max(15 - images.length, 0);

  const chooseImages = async () => {
    if (remainingSlots === 0) {
      return;
    }

    setPickerError(null);

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

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to add listing photos.');
      setPickerError('Allow ReTail to access your photos so you can add listing images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.65,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const selectedImages = result.assets
      .slice(0, remainingSlots)
      .map((asset) => {
        if (asset.base64) {
          return `data:${normalizedPickerMimeType(asset.mimeType)};base64,${asset.base64}`;
        }

        return asset.uri;
      })
      .filter((image): image is string => Boolean(image));

    if (selectedImages.length === 0) {
      setPickerError('Choose another image and try again.');
      return;
    }

    onChange([...images, ...selectedImages].slice(0, 15));
  };

  const removeImage = (image: string) => {
    onChange(images.filter((item) => item !== image));
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: themeColors.textPrimary }]}>Photos</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose listing photos"
        style={[
          styles.uploadButton,
          { backgroundColor: themeColors.surface, borderColor: error ? themeColors.error : themeColors.primary },
        ]}
        onPress={chooseImages}
      >
        <Camera size={24} color={themeColors.primary} />
        <View style={styles.uploadCopy}>
          <Text style={[styles.uploadTitle, { color: themeColors.textPrimary }]}>Choose images</Text>
          <Text style={[styles.uploadHint, { color: themeColors.textSecondary }]}>At least 1 required, up to 15 photos</Text>
        </View>
      </Pressable>

      {uploading ? (
        <View style={[styles.progressTrack, { backgroundColor: themeColors.border }]}>
          <View style={[styles.progressFill, { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: themeColors.primary }]} />
        </View>
      ) : null}

      {images.length ? (
        <View style={styles.previewGrid}>
          {images.map((image, index) => (
            <View key={`${image}-${index}`} style={[styles.previewWrap, { backgroundColor: themeColors.primarySoft }]}>
              <Image source={{ uri: image }} style={styles.previewImage} />
              {index === 0 ? <Text style={[styles.coverBadge, { backgroundColor: themeColors.primary, color: themeColors.white }]}>Cover</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                style={styles.removeButton}
                onPress={() => removeImage(image)}
              >
                <Trash2 size={16} color={themeColors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error || pickerError ? <Text style={[styles.error, { color: themeColors.error }]}>{error ?? pickerError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
