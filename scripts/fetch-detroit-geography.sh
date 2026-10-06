#!/usr/bin/env bash
# scripts/fetch-detroit-geography.sh — take a fresh copy of the City of
# Detroit's neighborhood polygons and city boundary into data/geography/.
#
# This is the ONLY thing that talks to the City's GIS service. The site and
# its nightly jobs read the committed copy (api/_lib/detroit-geography.js) and
# never the network. Run this by hand when the City publishes a change, look
# at `git diff --stat data/geography`, run test/detroit-geography.test.js (it
# checks that Hamtramck and Highland Park are still outside the boundary and
# that known venues still land where they did), commit.
#
#   bash scripts/fetch-detroit-geography.sh            # into data/geography/
#   bash scripts/fetch-detroit-geography.sh some/dir   # somewhere else
#
# Needs only curl and shasum (or sha256sum). Nothing is replaced unless all
# four downloads arrive and look like what they should be.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/data/geography}"
BASE="https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services"
NEIGHBORHOODS="$BASE/Current_City_of_Detroit_Neighborhoods/FeatureServer/0"
BOUNDARY="$BASE/City_of_Detroit_Boundary/FeatureServer/0"
# Everything, in latitude/longitude (WGS 84), six decimal places (about 10 cm).
QUERY="query?where=1%3D1&outFields=*&outSR=4326&geometryPrecision=6&f=geojson"
PAGE="https://data.detroitmi.gov/datasets/detroitmi::current-city-of-detroit-neighborhoods"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

get() { curl --fail --silent --show-error --location --max-time 120 "$1" -o "$2"; }
echo "Fetching from the City of Detroit's GIS service..."
get "$NEIGHBORHOODS/$QUERY" "$TMP/detroit-neighborhoods.geojson"
get "$BOUNDARY/$QUERY"      "$TMP/detroit-city-boundary.geojson"
get "$NEIGHBORHOODS?f=json" "$TMP/detroit-neighborhoods.layer.json"
get "$BOUNDARY?f=json"      "$TMP/detroit-city-boundary.layer.json"

count() { { grep -o '"type":"Feature"' "$1" || true; } | wc -l | tr -d ' '; }
bytes() { wc -c < "$1" | tr -d ' '; }
sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }
# The City's own "data last edited" stamp (milliseconds) as a date.
edited() {
  local ms secs
  ms="$({ grep -o '"dataLastEditDate":[0-9]*' "$1" || true; } | head -1 | cut -d: -f2)"
  [ -n "$ms" ] || { echo "unknown"; return; }
  secs=$((ms / 1000))
  date -u -r "$secs" +%Y-%m-%d 2>/dev/null || date -u -d "@$secs" +%Y-%m-%d
}

N="$(count "$TMP/detroit-neighborhoods.geojson")"
B="$(count "$TMP/detroit-city-boundary.geojson")"
grep -q '"FeatureCollection"' "$TMP/detroit-neighborhoods.geojson" || { echo "The neighborhoods download is not GeoJSON. Nothing changed." >&2; exit 1; }
grep -q '"FeatureCollection"' "$TMP/detroit-city-boundary.geojson" || { echo "The boundary download is not GeoJSON. Nothing changed." >&2; exit 1; }
grep -q '"exceededTransferLimit":true' "$TMP/detroit-neighborhoods.geojson" && { echo "The service cut the neighborhoods list short. Nothing changed." >&2; exit 1; }
[ "$N" -ge 200 ] || { echo "Only $N neighborhood polygons arrived (205 expected). Nothing changed." >&2; exit 1; }
[ "$B" -ge 1 ]   || { echo "No city boundary arrived. Nothing changed." >&2; exit 1; }
grep -q '"nhood_name"' "$TMP/detroit-neighborhoods.geojson" || { echo "The polygons carry no nhood_name. Nothing changed." >&2; exit 1; }
for layer in detroit-neighborhoods.layer.json detroit-city-boundary.layer.json; do
  grep -q '"fields"' "$TMP/$layer" || { echo "$layer is not a layer record (the service may have answered with an error). Nothing changed." >&2; exit 1; }
done

mkdir -p "$OUT"
cat > "$TMP/SNAPSHOT.txt" <<EOF
City of Detroit geography — snapshot
====================================
Copied on:   $(date -u +%Y-%m-%dT%H:%M:%SZ)
Copied by:   scripts/fetch-detroit-geography.sh
Publisher:   City of Detroit (Detroit Open Data Portal)
Public page: $PAGE
Coordinates: latitude/longitude, WGS 84 (EPSG:4326), 6 decimal places

1. Neighborhoods ("Current City of Detroit Neighborhoods")
   file:            detroit-neighborhoods.geojson
   polygons:        $N
   bytes:           $(bytes "$TMP/detroit-neighborhoods.geojson")
   sha256:          $(sha "$TMP/detroit-neighborhoods.geojson")
   City last edit:  $(edited "$TMP/detroit-neighborhoods.layer.json")
   source:          $NEIGHBORHOODS/$QUERY
   layer record:    detroit-neighborhoods.layer.json  ($NEIGHBORHOODS?f=json)

2. City limits ("City of Detroit Boundary")
   file:            detroit-city-boundary.geojson
   features:        $B
   bytes:           $(bytes "$TMP/detroit-city-boundary.geojson")
   sha256:          $(sha "$TMP/detroit-city-boundary.geojson")
   City last edit:  $(edited "$TMP/detroit-city-boundary.layer.json")
   source:          $BOUNDARY/$QUERY
   layer record:    detroit-city-boundary.layer.json  ($BOUNDARY?f=json)
EOF

for f in detroit-neighborhoods.geojson detroit-city-boundary.geojson detroit-neighborhoods.layer.json detroit-city-boundary.layer.json SNAPSHOT.txt; do
  mv "$TMP/$f" "$OUT/$f"
done
echo
cat "$OUT/SNAPSHOT.txt"
echo
echo "Saved to $OUT"
