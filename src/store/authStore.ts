import type { Profile, Session, User } from '../services/types';

export type AuthStoreState = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
};

let authState: AuthStoreState = {
  user: null,
  profile: null,
  session: null,
  loading: false,
  isGuest: true,
};

export function setAuthStoreState(nextState: AuthStoreState): void {
  authState = {
    ...nextState,
    isGuest: !nextState.user || !nextState.session,
  };
}

export function getAuthStoreState(): AuthStoreState {
  return authState;
}
