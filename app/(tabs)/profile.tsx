import { router } from 'expo-router';
import { ProfileScreen } from '../../src/sprint3/Sprint3App';

export default function ProfileRoute() {
  return (
    <ProfileScreen
      onEditProfile={() => router.push('/profile/edit')}
      onMyListings={() => router.push('/profile/my-listings')}
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onMessages={() => router.push('/messages')}
      onNotifications={() => router.push('/notifications')}
      onSettings={() => router.push('/settings')}
    />
  );
}
