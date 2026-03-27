import delhiZonesJson from "@/data/delhi-zones.json";

export interface DelhiZone {
  id: string;
  name: string;
  ward: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const delhiZones: DelhiZone[] = delhiZonesJson as DelhiZone[];

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function findZoneByIdOrAlias(input: unknown): DelhiZone | null {
  const normalized = normalizeText(String(input ?? ""));
  if (!normalized) {
    return null;
  }

  return (
    delhiZones.find((zone) => {
      if (normalizeText(zone.id) === normalized) {
        return true;
      }
      if (normalizeText(zone.name) === normalized) {
        return true;
      }
      return zone.aliases.some((alias) => normalizeText(alias) === normalized);
    }) ?? null
  );
}

export function inferZoneFromArea(area: unknown): DelhiZone | null {
  const normalizedArea = normalizeText(String(area ?? ""));
  if (!normalizedArea) {
    return null;
  }

  return (
    delhiZones.find((zone) => {
      if (normalizedArea.includes(normalizeText(zone.name))) {
        return true;
      }
      return zone.aliases.some((alias) => normalizedArea.includes(normalizeText(alias)));
    }) ?? null
  );
}

export function nearestDelhiZone(lat: unknown, lng: unknown): DelhiZone | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  let nearest: DelhiZone | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const zone of delhiZones) {
    const d = distanceKm(latitude, longitude, zone.lat, zone.lng);
    if (d < minDistance) {
      minDistance = d;
      nearest = zone;
    }
  }

  return nearest;
}

export function inferZoneId(input: {
  explicitZoneId?: unknown;
  area?: unknown;
  lat?: unknown;
  lng?: unknown;
}): string | undefined {
  const explicit = findZoneByIdOrAlias(input.explicitZoneId);
  if (explicit) {
    return explicit.id;
  }

  const fromArea = inferZoneFromArea(input.area);
  if (fromArea) {
    return fromArea.id;
  }

  const nearest = nearestDelhiZone(input.lat, input.lng);
  return nearest?.id;
}

export function isSameZone(userZoneId: string | undefined, issueZoneId: string | undefined): boolean {
  if (!userZoneId || !issueZoneId) {
    return false;
  }
  return userZoneId === issueZoneId;
}
