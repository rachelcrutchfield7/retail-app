import { Badge } from '../ui/Badge';

type ConditionBadgeProps = {
  condition: string;
};

export function ConditionBadge({ condition }: ConditionBadgeProps) {
  return <Badge label={condition} tone="info" />;
}
