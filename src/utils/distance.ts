import { formatDistance } from './formatDistance';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const earthRadiusMiles = 3958.7613;

export function hasCoordinates(value: Partial<Coordinates> | null | undefined): value is Coordinates {
  return Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude);
}

export function distanceMilesBetween(origin: Coordinates, destination: Coordinates): number {
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatDistanceMiles(miles: number | null | undefined): string {
  if (!Number.isFinite(miles)) {
    return 'Distance unavailable';
  }

  return formatDistance(Number(miles));
}

export function isWithinRadius(origin: Coordinates, destination: Coordinates, radiusMiles: number): boolean {
  return distanceMilesBetween(origin, destination) <= radiusMiles;
}

export function sortByDistance<Item>(
  items: Item[],
  origin: Coordinates,
  getCoordinates: (item: Item) => Partial<Coordinates> | null | undefined
): Item[] {
  return [...items].sort((first, second) => {
    const firstCoordinates = getCoordinates(first);
    const secondCoordinates = getCoordinates(second);

    if (!hasCoordinates(firstCoordinates)) {
      return 1;
    }

    if (!hasCoordinates(secondCoordinates)) {
      return -1;
    }

    return distanceMilesBetween(origin, firstCoordinates) - distanceMilesBetween(origin, secondCoordinates);
  });
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}
