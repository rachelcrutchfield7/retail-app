import { router, useLocalSearchParams } from 'expo-router';
import { ReportScreen } from '../../../src/sprint4/Sprint4App';

export default function ReportRoute() {
  const params = useLocalSearchParams<{ targetType: 'listing' | 'user' | 'message'; targetId: string }>();
  const targetType = params.targetType;
  const title = targetType === 'listing' ? 'Report listing' : targetType === 'user' ? 'Report user' : 'Report message';

  return (
    <ReportScreen
      targetType={targetType}
      targetId={params.targetId}
      title={title}
      onBack={() => router.back()}
    />
  );
}
