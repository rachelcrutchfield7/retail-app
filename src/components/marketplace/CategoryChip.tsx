import { Chip } from '../ui/Chip';

type CategoryChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function CategoryChip({ label, selected, onPress }: CategoryChipProps) {
  return <Chip label={label} selected={selected} onPress={onPress} />;
}
