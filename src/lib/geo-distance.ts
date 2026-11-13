export type LatLng = { lat: number; lng: number };

export function haversineKm(origin: LatLng, target: LatLng): number {
  const radius = 6371;
  const dLat = ((target.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((target.lng - origin.lng) * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (target.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * radius * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Browser geolocation with explicit permission handling and no silent failure. */
export function requestLocation(handlers?: { onError?: (message: string) => void }): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      handlers?.onError?.("This browser does not support location sharing.");
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: Math.round(position.coords.latitude * 1e5) / 1e5, lng: Math.round(position.coords.longitude * 1e5) / 1e5 }),
      (error) => {
        handlers?.onError?.(error.message || "Location permission was not granted.");
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export const CAMPUS_NOTE = "Distances are straight-line estimates from your shared location, not road distances.";
