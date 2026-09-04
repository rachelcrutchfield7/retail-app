import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { TextInput } from './TextInput';

type LocationPickerProps = {
  city: string;
  state: string;
  cityLabel?: string;
  stateLabel?: string;
  onCityChange: (city: string) => void;
  onStateChange: (state: string) => void;
  cityError?: string;
  stateError?: string;
};

export function LocationPicker({
  city,
  state,
  cityLabel = 'City',
  stateLabel = 'State',
  onCityChange,
  onStateChange,
  cityError,
  stateError,
}: LocationPickerProps) {
  return (
    <View style={styles.locationGrid}>
      <TextInput
        label={cityLabel}
        value={city}
        onChangeText={onCityChange}
        placeholder="City"
        textContentType="addressCity"
        error={cityError}
      />
      <TextInput
        label={stateLabel}
        value={state}
        onChangeText={onStateChange}
        placeholder="State"
        autoCapitalize="characters"
        textContentType="addressState"
        error={stateError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  locationGrid: {
    gap: spacing.md,
  },
});
