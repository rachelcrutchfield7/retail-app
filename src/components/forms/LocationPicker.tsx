import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { TextInput } from './TextInput';

type LocationPickerProps = {
  city: string;
  state: string;
  onCityChange: (city: string) => void;
  onStateChange: (state: string) => void;
  cityError?: string;
  stateError?: string;
};

export function LocationPicker({
  city,
  state,
  onCityChange,
  onStateChange,
  cityError,
  stateError,
}: LocationPickerProps) {
  return (
    <View style={styles.locationGrid}>
      <TextInput
        label="City"
        value={city}
        onChangeText={onCityChange}
        placeholder="Austin"
        textContentType="addressCity"
        error={cityError}
      />
      <TextInput
        label="State"
        value={state}
        onChangeText={onStateChange}
        placeholder="TX"
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
