import { TextField } from './TextField';

type PriceInputProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
};

export function PriceInput({ label = 'Price', value, onChangeText, error }: PriceInputProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder="$"
      keyboardType="default"
      error={error}
    />
  );
}
