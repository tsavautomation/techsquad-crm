"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { motionLabel, reportedLabel } from "@/lib/bouncie/age";
import { freshness, type MapVehicle } from "@/lib/bouncie/match";
import { clock } from "@/lib/schedule/dates";
import type { MapOffice, MapStop } from "@/lib/schedule/map";
import { useT } from "@/i18n/client";

// The Leaflet map itself (F8). Loaded only in the browser (next/dynamic, ssr: false) because Leaflet
// touches `window` on import. Markers are small HTML pins (divIcon) so no image files are needed:
// a numbered circle per job stop in the visit's status colour, a pill with a heading arrow per van,
// and a square for the office.

export type MapLabels = Record<string, never>;

type Props = {
  stops: MapStop[];
  vehicles: MapVehicle[];
  office: MapOffice | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
};

// South Florida, where Tech Squad works: used when the day has no stops and no office position yet.
const HOME: [number, number] = [26.12, -80.2];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function stopIcon(s: MapStop, active: boolean) {
  const size = active ? 34 : 28;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${esc(s.color)};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgb(0 0 0/.35);display:flex;align-items:center;justify-content:center;font:600 ${active ? 15 : 13}px/1 Inter,system-ui,sans-serif">${s.order}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function vehicleIcon(v: MapVehicle, active: boolean) {
  const f = freshness(v.updatedAt);
  const bg = f === "fresh" ? (v.isRunning ? "#f97316" : "#1f2937") : f === "recent" ? "#6b7280" : "#9ca3af";
  // The driver's name when known, else the short nickname from the Bouncie app ("TSAV1 Ford").
  const label = v.driverName ?? v.name;
  const arrow = v.heading !== null ? `<span style="display:inline-block;transform:rotate(${Math.round(v.heading)}deg);margin-right:4px">&#10148;</span>` : `<span style="margin-right:4px">&#9679;</span>`;
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;background:${bg};color:#fff;border:2px solid #fff;border-radius:999px;padding:4px 10px;box-shadow:0 2px 6px rgb(0 0 0/.35);font:600 ${active ? 13 : 12}px/1.2 Inter,system-ui,sans-serif;display:inline-flex;align-items:center">${arrow}${esc(label)}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });
}

const officeIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:6px;background:#0e76ad;border:2px solid #fff;box-shadow:0 2px 6px rgb(0 0 0/.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

/** Fit everything in view when the day's points change; fly to the selected pin when one is tapped. */
function Camera({ points, selected }: { points: [number, number][]; selected: [number, number] | null }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (!points.length) {
      map.setView(HOME, 10);
      return;
    }
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the points' values
  }, [map, key]);
  useEffect(() => {
    if (selected) map.flyTo(selected, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [map, selected]);
  return null;
}

export function LeafletMap({ stops, vehicles, office, selected, onSelect }: Props) {
  const tr = useT();
  const placed = stops.filter((s): s is MapStop & { lat: number; lng: number } => s.lat !== null && s.lng !== null);
  const moving = vehicles.filter((v): v is MapVehicle & { lat: number; lng: number } => v.lat !== null && v.lng !== null);
  const points: [number, number][] = [...placed.map((s) => [s.lat, s.lng] as [number, number]), ...moving.map((v) => [v.lat, v.lng] as [number, number])];
  if (office && !points.length) points.push([office.lat, office.lng]);
  const sel =
    selected?.startsWith("stop:") ? placed.find((s) => `stop:${s.id}` === selected) : selected?.startsWith("veh:") ? moving.find((v) => `veh:${v.imei}` === selected) : null;
  const selPoint: [number, number] | null = sel ? [sel.lat, sel.lng] : null;
  const center: [number, number] = points[0] ?? HOME;

  return (
    <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full" style={{ background: "#e5e7eb" }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Camera points={points} selected={selPoint} />
      {office && (
        <Marker position={[office.lat, office.lng]} icon={officeIcon} zIndexOffset={-100}>
          <Popup>
            <b>{tr("Office")}</b>
            <br />
            {office.address}
          </Popup>
        </Marker>
      )}
      {placed.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s, selected === `stop:${s.id}`)} eventHandlers={{ click: () => onSelect(`stop:${s.id}`) }}>
          <Popup>
            <b>
              {s.order}. {s.project}
            </b>
            <br />
            {clock(s.start.slice(11))} · {s.techName ?? tr("No technician")}
            {s.team.length > 0 && ` + ${s.team.map((t) => t.name).join(", ")}`}
            <br />
            {s.address}
            <br />
            <span style={{ color: s.color }}>{tr(s.status)}</span>
            {" · "}
            <a href={s.href}>{tr("Open the visit")}</a>
          </Popup>
        </Marker>
      ))}
      {moving.map((v) => {
        return (
          <Marker key={v.imei} position={[v.lat, v.lng]} icon={vehicleIcon(v, selected === `veh:${v.imei}`)} zIndexOffset={500} eventHandlers={{ click: () => onSelect(`veh:${v.imei}`) }}>
            <Popup>
              <b>{v.name}</b>
              {v.vehicleTitle && (
                <>
                  <br />
                  {v.vehicleTitle}
                </>
              )}
              {v.driverName && (
                <>
                  <br />
                  {tr("Usual driver")}: {v.driverName}
                </>
              )}
              <br />
              {motionLabel(tr, v)} · {reportedLabel(tr, v.updatedAt)}
              {v.address && (
                <>
                  <br />
                  {v.address}
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
