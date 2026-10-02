export type CommunityListingCampaignPresentationInput = {
  qualifyingListingCount: number;
  targetListingCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

export type CommunityListingCampaignState =
  | 'upcoming'
  | 'active'
  | 'goal-reached'
  | 'ended';

export type CommunityListingCampaignPresentation = {
  state: CommunityListingCampaignState;
  qualifyingListingCount: number;
  targetListingCount: number;
  progressPercent: number;
  accessibleProgressValue: number;
  startsAt: Date;
  endsAt: Date;
};

export function getCommunityListingCampaignPresentation(
  campaign: CommunityListingCampaignPresentationInput | null,
  nowMs = Date.now(),
): CommunityListingCampaignPresentation | null {
  if (!campaign?.startsAt || !campaign.endsAt) {
    return null;
  }

  const startsAt = new Date(campaign.startsAt);
  const endsAt = new Date(campaign.endsAt);
  const startsAtMs = startsAt.getTime();
  const endsAtMs = endsAt.getTime();
  const targetListingCount = campaign.targetListingCount;

  if (
    !Number.isFinite(startsAtMs)
    || !Number.isFinite(endsAtMs)
    || !Number.isFinite(targetListingCount)
    || targetListingCount <= 0
    || endsAtMs <= startsAtMs
  ) {
    return null;
  }

  const qualifyingListingCount = campaign.qualifyingListingCount;
  const progressPercent = Math.min(
    100,
    Math.max(0, (qualifyingListingCount / targetListingCount) * 100),
  );
  const accessibleProgressValue = Math.min(
    targetListingCount,
    Math.max(0, qualifyingListingCount),
  );

  if (!campaign.isActive) {
    return null;
  }

  if (nowMs >= endsAtMs) {
    return {
      state: 'ended',
      qualifyingListingCount,
      targetListingCount,
      progressPercent,
      accessibleProgressValue,
      startsAt,
      endsAt,
    };
  }

  const state: CommunityListingCampaignState = nowMs < startsAtMs
    ? 'upcoming'
    : qualifyingListingCount >= targetListingCount
      ? 'goal-reached'
      : 'active';

  return {
    state,
    qualifyingListingCount,
    targetListingCount,
    progressPercent,
    accessibleProgressValue,
    startsAt,
    endsAt,
  };
}
