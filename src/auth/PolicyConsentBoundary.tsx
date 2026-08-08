import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { PolicyConsentGate } from '../components/feedback/PolicyConsentGate';
import {
  getCurrentConsentState,
  recordCurrentPolicyAcceptance,
  type CurrentConsentState,
  type PolicyConsentSource,
} from '../services/consentService';

export function PolicyConsentBoundary({
  userId,
  source,
  onSignOut,
  children,
}: {
  userId: string;
  source: PolicyConsentSource;
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
      .then((nextState) => {
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
  }, [userId]);

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
