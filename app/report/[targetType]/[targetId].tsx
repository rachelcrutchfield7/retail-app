import { router, useLocalSearchParams } from 'expo-router';
import { ReportScreen } from '../../../src/sprint4/Sprint4App';

export default function ReportRoute() {
  const params = useLocalSearchParams<{ targetType: 'listing' | 'user' | 'message' | 'iso_post'; targetId: string }>();
  const targetType = params.targetType;
  const title = targetType === 'listing'
    ? 'Report listing'
    : targetType === 'user'
      ? 'Report user'
      : targetType === 'message'
        ? 'Report message'
        : 'Report ISO request';

  return (
    <ReportScreen
      targetType={targetType}
      targetId={params.targetId}
      title={title}
      onBack={() => router.back()}
    />
  );
}
