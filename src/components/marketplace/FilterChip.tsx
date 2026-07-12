import { Chip } from '../ui/Chip';

type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return <Chip label={label} selected={selected} onPress={onPress} />;
}
