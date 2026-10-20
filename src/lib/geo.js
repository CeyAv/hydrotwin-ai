/**
 * Planar point-in-polygon for GeoJSON in CRS84 (lng/lat degrees).
 *
 * Coordinates are treated as flat x/y. Over a single district that is accurate
 * to well under a metre; if HydroTwin grows beyond one city, swap in turf.js
 * rather than patching this by hand.
 */

/** Ray-casting test against one linear ring. Points exactly on an edge are undefined. */
function pointInRing([lng, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True if a [lng, lat] position falls inside a Polygon or MultiPolygon.
 * The first ring of each polygon is its outline; any further rings are holes.
 */
export function pointInPolygon(position, geometry) {
  const polygons =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];

  return polygons.some(([outer, ...holes]) => {
    if (!pointInRing(position, outer)) return false;
    return !holes.some((hole) => pointInRing(position, hole));
  });
}

const METRES_PER_DEGREE_LAT = 111320;
const REFERENCE_LAT = 41.015; // Fatih, İstanbul

/** Project lng/lat degrees to local metres so distances are comparable. */
function toMetres([lng, lat]) {
  return [
    lng * METRES_PER_DEGREE_LAT * Math.cos((REFERENCE_LAT * Math.PI) / 180),
    lat * METRES_PER_DEGREE_LAT,
  ];
}

/** Shortest distance in metres from a point to a line segment. */
function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shortest distance in metres from a point to a polygon's outline. */
export function distanceToPolygonEdge(position, geometry) {
  const polygons =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const point = toMetres(position);
  let shortest = Infinity;

  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        shortest = Math.min(
          shortest,
          distanceToSegment(point, toMetres(ring[i]), toMetres(ring[i + 1])),
        );
      }
    }
  }
  return shortest;
}

/** Metres from a point to the nearest flood zone — 0 if it sits inside one. */
export function distanceToFloodZones(position, zones) {
  if (zones.some((zone) => pointInPolygon(position, zone.geometry))) return 0;
  return Math.min(
    ...zones.map((zone) => distanceToPolygonEdge(position, zone.geometry)),
  );
}
