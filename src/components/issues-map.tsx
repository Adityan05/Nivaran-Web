"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleMap,
  OverlayView,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { FloodRiskAlert, IssueRecord } from "@/lib/types";
import { delhiZones, inferZoneId } from "@/lib/zones";

interface IssuesMapProps {
  issues: IssueRecord[];
  floodRiskAlerts?: FloodRiskAlert[];
}

function statusRing(status: IssueRecord["status"]): string {
  switch (status) {
    case "Resolved":
      return "ring-emerald-500";
    case "In Progress":
      return "ring-amber-500";
    case "Acknowledged":
      return "ring-sky-500";
    case "Rejected":
      return "ring-rose-500";
    default:
      return "ring-slate-500";
  }
}

function statusAnimation(status: IssueRecord["status"]): string {
  switch (status) {
    case "Reported":
      return "status-marker-reported";
    case "Acknowledged":
      return "status-marker-acknowledged";
    case "In Progress":
      return "status-marker-inprogress";
    case "Resolved":
      return "status-marker-resolved";
    case "Rejected":
      return "status-marker-rejected";
    default:
      return "";
  }
}

export default function IssuesMap({
  issues,
  floodRiskAlerts = [],
}: IssuesMapProps) {
  const router = useRouter();
  const [showIssueMarkers, setShowIssueMarkers] = useState(true);
  const [showRiskLayer, setShowRiskLayer] = useState(true);
  const [showUnassignedHotspots, setShowUnassignedHotspots] = useState(true);
  const [showZonesLayer, setShowZonesLayer] = useState(true);
  const [showZoneIssueLinks, setShowZoneIssueLinks] = useState(true);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  const zoneColorById = useMemo(() => {
    const palette = [
      "#e11d48",
      "#f97316",
      "#f59e0b",
      "#84cc16",
      "#22c55e",
      "#10b981",
      "#14b8a6",
      "#06b6d4",
      "#0ea5e9",
      "#3b82f6",
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
    ];
    const map = new Map<string, string>();
    delhiZones.forEach((zone, index) => {
      map.set(zone.id, palette[index % palette.length]);
    });
    return map;
  }, []);

  const zoneIssueData = useMemo(() => {
    const zoneById = new Map(delhiZones.map((zone) => [zone.id, zone]));
    const unresolvedCountByZone = new Map<string, number>();
    const issueLinks: Array<{
      zoneId: string;
      zoneLat: number;
      zoneLng: number;
      issueLat: number;
      issueLng: number;
    }> = [];

    for (const issue of issues) {
      const zoneId = inferZoneId({
        explicitZoneId: issue.zoneId,
        area: issue.area || issue.locationAddress,
        lat: issue.lat,
        lng: issue.lng,
      });
      if (!zoneId) {
        continue;
      }

      const zone = zoneById.get(zoneId);
      if (!zone) {
        continue;
      }

      const isUnresolved =
        issue.status !== "Resolved" && issue.status !== "Rejected";
      if (isUnresolved) {
        unresolvedCountByZone.set(
          zoneId,
          (unresolvedCountByZone.get(zoneId) ?? 0) + 1,
        );
      }

      issueLinks.push({
        zoneId,
        zoneLat: zone.lat,
        zoneLng: zone.lng,
        issueLat: issue.lat,
        issueLng: issue.lng,
      });
    }

    return {
      unresolvedCountByZone,
      issueLinks,
    };
  }, [issues]);

  const riskLevelClass: Record<FloodRiskAlert["riskLevel"], string> = {
    Low: "border-emerald-400/70 bg-emerald-300/15",
    Moderate: "border-amber-400/80 bg-amber-300/20",
    High: "border-orange-500/85 bg-orange-400/20",
    Critical: "border-rose-500/90 bg-rose-400/25",
  };

  const unassignedHotspots = useMemo(() => {
    const grouped = new Map<
      string,
      { lat: number; lng: number; count: number; sampleTitle: string }
    >();

    for (const issue of issues) {
      if (issue.assignedToId) {
        continue;
      }
      if (issue.status === "Resolved" || issue.status === "Rejected") {
        continue;
      }

      const key = `${issue.lat.toFixed(2)}:${issue.lng.toFixed(2)}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          lat: issue.lat,
          lng: issue.lng,
          count: 1,
          sampleTitle: issue.title,
        });
        continue;
      }

      existing.count += 1;
      existing.lat = (existing.lat + issue.lat) / 2;
      existing.lng = (existing.lng + issue.lng) / 2;
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [issues]);

  const mapPoints = useMemo(() => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (showIssueMarkers) {
      for (const issue of issues) {
        points.push({ lat: issue.lat, lng: issue.lng });
      }
    }
    if (showRiskLayer) {
      for (const alert of floodRiskAlerts) {
        points.push({ lat: alert.lat, lng: alert.lng });
      }
    }
    if (showUnassignedHotspots) {
      for (const hotspot of unassignedHotspots) {
        points.push({ lat: hotspot.lat, lng: hotspot.lng });
      }
    }
    if (showZonesLayer) {
      for (const zone of delhiZones) {
        points.push({ lat: zone.lat, lng: zone.lng });
      }
    }
    return points;
  }, [
    showIssueMarkers,
    issues,
    showRiskLayer,
    floodRiskAlerts,
    showUnassignedHotspots,
    unassignedHotspots,
    showZonesLayer,
  ]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      const bounds = new google.maps.LatLngBounds();
      if (mapPoints.length === 0) {
        map.setCenter({ lat: 28.67, lng: 77.43 });
        map.setZoom(11);
        return;
      }
      mapPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 60);
    },
    [mapPoints],
  );

  if (issues.length === 0 && floodRiskAlerts.length === 0) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        No map markers are available for your current role and scope.
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        Google Maps API key is missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in
        your environment to view the map.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="ui-card p-6 text-sm text-slate-600">
        Loading Google Map...
      </div>
    );
  }

  const defaultCenter = mapPoints[0] ?? { lat: 28.67, lng: 77.43 };

  return (
    <div className="ui-card relative overflow-hidden p-2">
      <div className="absolute left-4 top-4 z-20 w-64 rounded-xl border border-slate-300/65 bg-white/95 p-3 text-xs shadow-[0_12px_22px_rgba(2,6,23,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">
          Map Layers
        </p>
        <div className="mt-2 space-y-2 text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showIssueMarkers}
              onChange={(event) => setShowIssueMarkers(event.target.checked)}
            />
            <span>Issue markers ({issues.length})</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showRiskLayer}
              onChange={(event) => setShowRiskLayer(event.target.checked)}
            />
            <span>Predicted risk zones ({floodRiskAlerts.length})</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showUnassignedHotspots}
              onChange={(event) =>
                setShowUnassignedHotspots(event.target.checked)
              }
            />
            <span>Unassigned hotspots ({unassignedHotspots.length})</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showZonesLayer}
              onChange={(event) => setShowZonesLayer(event.target.checked)}
            />
            <span>Delhi zones ({delhiZones.length})</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showZoneIssueLinks}
              onChange={(event) => setShowZoneIssueLinks(event.target.checked)}
            />
            <span>Zone to issue links</span>
          </label>
        </div>
      </div>

      <GoogleMap
        mapContainerStyle={{ height: "70vh", width: "100%" }}
        center={defaultCenter}
        zoom={12}
        onLoad={onMapLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {showZonesLayer && showZoneIssueLinks
          ? zoneIssueData.issueLinks.map((link, index) => {
              const strokeColor = zoneColorById.get(link.zoneId) ?? "#64748b";
              return (
                <Polyline
                  key={`zone-link-${link.zoneId}-${index}`}
                  path={[
                    { lat: link.zoneLat, lng: link.zoneLng },
                    { lat: link.issueLat, lng: link.issueLng },
                  ]}
                  options={{
                    strokeColor,
                    strokeOpacity: 0.28,
                    strokeWeight: 1.6,
                    geodesic: false,
                    clickable: false,
                  }}
                />
              );
            })
          : null}

        {showZonesLayer
          ? delhiZones.map((zone) => {
              const unresolvedCount =
                zoneIssueData.unresolvedCountByZone.get(zone.id) ?? 0;
              const zoneColor = zoneColorById.get(zone.id) ?? "#64748b";
              return (
                <OverlayView
                  key={`zone-${zone.id}`}
                  position={{ lat: zone.lat, lng: zone.lng }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
                  <div className="group relative -translate-x-1/2 -translate-y-1/2">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full border border-white/60 bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
                      {unresolvedCount}
                    </div>
                    <div
                      className="grid h-10 w-10 place-items-center rounded-full border-2 text-white shadow-lg"
                      style={{
                        backgroundColor: zoneColor,
                        borderColor: "#ffffff",
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase">
                        {zone.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 3)}
                      </span>
                    </div>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-48 -translate-x-1/2 rounded-lg border border-slate-300/55 bg-white/95 p-2 text-xs text-slate-700 shadow-[0_10px_20px_rgba(2,6,23,0.14)] group-hover:block">
                      <p className="font-semibold text-slate-900">
                        {zone.name}
                      </p>
                      <p className="mt-0.5 text-slate-600">{zone.ward}</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        Active unresolved issues: {unresolvedCount}
                      </p>
                    </div>
                  </div>
                </OverlayView>
              );
            })
          : null}

        {showIssueMarkers
          ? issues.map((issue) => (
              <OverlayView
                key={issue.id}
                position={{ lat: issue.lat, lng: issue.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/issues/${issue.id}`)}
                  title={issue.title}
                  className={`group relative -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ${statusRing(issue.status)} ${statusAnimation(issue.status)} transition hover:scale-110 focus:scale-110 focus:outline-none`}
                >
                  <img
                    src={issue.imageUrl}
                    alt={issue.title}
                    className="h-11 w-11 rounded-full border-2 border-white object-cover shadow-lg"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/issue-placeholder.svg";
                    }}
                  />
                  <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-300/55 bg-gradient-to-b from-slate-50/95 to-slate-100/85 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-[0_8px_14px_rgba(2,6,23,0.14)] group-hover:block">
                    {issue.title}
                  </span>
                </button>
              </OverlayView>
            ))
          : null}

        {showUnassignedHotspots
          ? unassignedHotspots.map((hotspot) => (
              <OverlayView
                key={`hotspot-${hotspot.lat.toFixed(3)}-${hotspot.lng.toFixed(3)}`}
                position={{ lat: hotspot.lat, lng: hotspot.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="group relative -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute inset-0 animate-ping rounded-full border-2 border-rose-500/70" />
                  <div className="relative grid h-9 w-9 place-items-center rounded-full border-2 border-rose-500 bg-rose-50 text-xs font-bold text-rose-700 shadow-lg">
                    {hotspot.count}
                  </div>
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-52 -translate-x-1/2 rounded-lg border border-slate-300/55 bg-white/95 p-2 text-xs text-slate-700 shadow-[0_10px_20px_rgba(2,6,23,0.14)] group-hover:block">
                    <p className="font-semibold text-slate-900">
                      Unassigned hotspot
                    </p>
                    <p className="mt-0.5">
                      {hotspot.count} pending unassigned issues
                    </p>
                    <p className="mt-1 text-slate-600">
                      Example: {hotspot.sampleTitle}
                    </p>
                  </div>
                </div>
              </OverlayView>
            ))
          : null}

        {showRiskLayer
          ? floodRiskAlerts.map((alert) => (
              <OverlayView
                key={alert.id}
                position={{ lat: alert.lat, lng: alert.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="group relative -translate-x-1/2 -translate-y-1/2">
                  <div
                    className={`h-12 w-12 animate-pulse rounded-full border-2 ${riskLevelClass[alert.riskLevel]}`}
                  />
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-300/55 bg-white/95 p-2 text-xs text-slate-700 shadow-[0_10px_20px_rgba(2,6,23,0.14)] group-hover:block">
                    <p className="font-semibold text-slate-900">
                      Flood risk: {alert.riskLevel}
                    </p>
                    <p className="mt-0.5">{alert.area}</p>
                    <p className="mt-1 text-slate-600">{alert.warning}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-600">
                      Confidence {(alert.confidenceScore * 100).toFixed(0)}%
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {alert.sourceTags.map((tag) => (
                        <span
                          key={`${alert.id}-${tag}`}
                          className="rounded-full border border-slate-300/55 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                        >
                          {tag.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </OverlayView>
            ))
          : null}
      </GoogleMap>
    </div>
  );
}
