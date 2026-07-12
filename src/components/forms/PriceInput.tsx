import { TextField } from './TextField';

type PriceInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
};

export function PriceInput({ value, onChangeText, error }: PriceInputProps) {
  return (
    <TextField
      label="Price"
      value={value}
      onChangeText={onChangeText}
      placeholder="$25"
      keyboardType="default"
      error={error}
    />
  );
}
