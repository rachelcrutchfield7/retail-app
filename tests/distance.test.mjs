import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceMilesBetween, formatDistanceMiles, hasCoordinates, isWithinRadius } from '../src/utils/distance.ts';

test('distance utility calculates approximate mileage between coordinates', () => {
  const austin = { latitude: 30.2672, longitude: -97.7431 };
  const roundRock = { latitude: 30.5083, longitude: -97.6789 };

  const miles = distanceMilesBetween(austin, roundRock);

  assert.ok(miles > 15);
  assert.ok(miles < 20);
});

test('distance utility formats friendly distance labels', () => {
  assert.equal(formatDistanceMiles(0.05), 'Nearby');
  assert.equal(formatDistanceMiles(2.25), '2.3 mi');
  assert.equal(formatDistanceMiles(15.4), '15 mi');
  assert.equal(formatDistanceMiles(undefined), 'Distance unavailable');
});

test('distance utility validates coordinates and radius checks', () => {
  const origin = { latitude: 30.2672, longitude: -97.7431 };
  const nearby = { latitude: 30.2791, longitude: -97.7444 };

  assert.equal(hasCoordinates(origin), true);
  assert.equal(hasCoordinates({ latitude: undefined, longitude: -97.7431 }), false);
  assert.equal(isWithinRadius(origin, nearby, 5), true);
});
