"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, OverlayView, useJsApiLoader } from "@react-google-maps/api";
import { IssueRecord } from "@/lib/types";

interface IssuesMapProps {
  issues: IssueRecord[];
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

export default function IssuesMap({ issues }: IssuesMapProps) {
  const router = useRouter();
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      const bounds = new google.maps.LatLngBounds();
      issues.forEach((issue) =>
        bounds.extend({ lat: issue.lat, lng: issue.lng }),
      );
      map.fitBounds(bounds, 60);
    },
    [issues],
  );

  if (issues.length === 0) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        No issues are visible for your current role and scope.
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

  const defaultCenter = { lat: issues[0].lat, lng: issues[0].lng };

  return (
    <div className="ui-card overflow-hidden p-2">
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
        {issues.map((issue) => (
          <OverlayView
            key={issue.id}
            position={{ lat: issue.lat, lng: issue.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <button
              type="button"
              onClick={() => router.push(`/issues/${issue.id}`)}
              title={`${issue.id}: ${issue.title}`}
              className={`group relative -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ${statusRing(issue.status)} transition hover:scale-110 focus:scale-110 focus:outline-none`}
            >
              <img
                src={issue.imageUrl}
                alt={issue.title}
                className="h-11 w-11 rounded-full border-2 border-white object-cover shadow-lg"
              />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-300/55 bg-gradient-to-b from-slate-50/95 to-slate-100/85 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-[0_8px_14px_rgba(2,6,23,0.14)] group-hover:block">
                {issue.id}
              </span>
            </button>
          </OverlayView>
        ))}
      </GoogleMap>
    </div>
  );
}
