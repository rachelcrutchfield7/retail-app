import { useCallback, useEffect, useState } from 'react';
import { completeOnboarding, hasCompletedOnboarding } from '../services/onboardingService';

export function useOnboardingDecision({ authLoading, signedIn }: { authLoading: boolean; signedIn: boolean }) {
  const [loading, setLoading] = useState(true);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    let active = true;

    if (authLoading) {
      return () => {
        active = false;
      };
    }

    if (signedIn) {
      setShouldShow(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void hasCompletedOnboarding()
      .then((completed) => {
        if (active) {
          setShouldShow(!completed);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authLoading, signedIn]);

  const complete = useCallback(async () => {
    await completeOnboarding();
    setShouldShow(false);
  }, []);

  return {
    loading,
    shouldShow,
    complete,
    replay: () => setShouldShow(true),
  };
}
