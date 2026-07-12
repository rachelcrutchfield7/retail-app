import assert from 'node:assert/strict';
import test from 'node:test';
import { rescueOrganizations } from '../src/data/mockData.ts';
import { defaultLocationState } from '../src/store/locationStore.ts';
import { distanceMilesBetween, sortByDistance } from '../src/utils/distance.ts';

test('rescue hub has nearby rescue organizations', () => {
  assert.ok(rescueOrganizations.length >= 3);
  assert.ok(rescueOrganizations.every((rescue) =>
    rescue.name &&
    rescue.location &&
    rescue.distance &&
    Number.isFinite(rescue.latitude) &&
    Number.isFinite(rescue.longitude)
  ));
});

test('every rescue includes urgent needs with urgency levels', () => {
  for (const rescue of rescueOrganizations) {
    assert.ok(rescue.urgentNeeds.length > 0, `${rescue.name} should have at least one need`);

    for (const need of rescue.urgentNeeds) {
      assert.ok(need.item);
      assert.ok(need.quantity);
      assert.ok(['High', 'Medium', 'Low'].includes(need.urgency));
    }
  }
});

test('rescue hub surfaces at least one high priority need', () => {
  const highPriorityNeeds = rescueOrganizations.flatMap((rescue) =>
    rescue.urgentNeeds.filter((need) => need.urgency === 'High')
  );

  assert.ok(highPriorityNeeds.length > 0);
});

test('rescue hub can sort rescues by calculated distance', () => {
  const sortedRescues = sortByDistance(rescueOrganizations, defaultLocationState, (rescue) => rescue);
  const sortedDistances = sortedRescues.map((rescue) => distanceMilesBetween(defaultLocationState, rescue));

  assert.deepEqual(sortedDistances, [...sortedDistances].sort((first, second) => first - second));
});

test('rescue hub data supports searching by rescue or needed supply', () => {
  const searchableText = rescueOrganizations
    .map((rescue) =>
      [
        rescue.name,
        rescue.location,
        rescue.summary,
        rescue.contactHint,
        ...rescue.urgentNeeds.map((need) => need.item),
      ].join(' ')
    )
    .join(' ')
    .toLowerCase();

  assert.match(searchableText, /green paws rescue/);
  assert.match(searchableText, /small crates/);
});
