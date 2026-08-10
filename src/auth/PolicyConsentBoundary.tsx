import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { PolicyConsentGate } from '../components/feedback/PolicyConsentGate';
import {
  getCurrentConsentState,
  recordCurrentPolicyAcceptance,
  shouldFinalizePendingSignupConsent,
  type CurrentConsentState,
  type PolicyConsentSource,
} from '../services/consentService';
import type { PendingSignupConsent } from '../services/types';

export function PolicyConsentBoundary({
  userId,
  source,
  pendingSignupConsent,
  onSignOut,
  children,
}: {
  userId: string;
  source: PolicyConsentSource;
  pendingSignupConsent?: PendingSignupConsent;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}) {
  const [state, setState] = useState<CurrentConsentState | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setChecking(true);
    setNotice(null);

    void getCurrentConsentState()
      .then(async (nextState) => {
        if (shouldFinalizePendingSignupConsent(nextState, pendingSignupConsent)) {
          const finalizedState = await recordCurrentPolicyAcceptance(
            pendingSignupConsent.marketingEmailOptIn,
            pendingSignupConsent.source
          );

          if (active) {
            setState(finalizedState);
          }
          return;
        }

        if (active) {
          setState(nextState);
        }
      })
      .catch(() => {
        if (active) {
          setState(null);
          setNotice('ReTail could not verify an existing acceptance record. Review the policies below to continue safely.');
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [pendingSignupConsent, userId]);

  if (checking) {
    return <PolicyConsentGate checking onAccept={async () => {}} onSignOut={onSignOut} />;
  }

  if (state?.hasCurrentPolicyAcceptance) {
    return <>{children}</>;
  }

  return (
    <PolicyConsentGate
      initialMarketingEmailOptIn={state?.marketingEmailOptIn ?? false}
      notice={notice}
      onAccept={async (marketingEmailOptIn) => {
        const nextState = await recordCurrentPolicyAcceptance(marketingEmailOptIn, source);
        setState(nextState);
        setNotice(null);
      }}
      onSignOut={onSignOut}
    />
  );
}
