# data/geography — the City of Detroit's map, as 313.events uses it

Two layers published by the City of Detroit, copied here so that nothing the
site does at night depends on the City's GIS service being reachable:

| file | what it is | used for |
|---|---|---|
| `detroit-neighborhoods.geojson` | "Current City of Detroit Neighborhoods" — 205 polygons, each with the City's name for it (`nhood_name`) | which neighborhood a venue's coordinates fall in |
| `detroit-city-boundary.geojson` | "City of Detroit Boundary" — the city limits, including the hole where Hamtramck and Highland Park are | whether a venue is in Detroit at all |
| `*.layer.json` | the City's own record for each layer (fields, its "data last edited" date) | provenance |
| `SNAPSHOT.txt` | when this copy was taken, from which URLs, sizes, SHA-256 | provenance |

Public page for the dataset:
https://data.detroitmi.gov/datasets/detroitmi::current-city-of-detroit-neighborhoods

## How it is used

`api/_lib/detroit-geography.js` answers two questions from these files and
nothing else: *is this point inside the city limits?* and *which neighborhood
polygon contains it?* `scripts/venue-geography.js` asks them for each
canonical venue's coordinates and records the venue's neighborhood; events
inherit it through their venue.

A neighborhood is never taken from a ZIP code, a venue's name, or a postal
city. A point outside the limits never gets a Detroit neighborhood. A
neighborhood a person assigned is never changed. A point within 50 metres of
a polygon's edge is not trusted on its own: the City's parcel record for the
exact address has to settle it (`api/_lib/detroit-parcels.js`), or the venue
stays unresolved.

**The step is off in production until `VENUE_GEOGRAPHY=on` is set** (see
`api/cron-enrichment.js`). To see what it would do without writing anything:

```
VENUE_GEOGRAPHY_DRY_RUN=true node scripts/venue-geography.js
```

## Refreshing the copy

```
bash scripts/fetch-detroit-geography.sh
git diff --stat data/geography
REPO_DIR=$PWD node test/detroit-geography.test.js
```

The test checks the copy against known places (the Fox Theatre is Downtown;
Hamtramck is outside). If the City has renamed, added or removed polygons the
test says which expectation changed; read `api/_lib/detroit-geography.js`
(`GEOGRAPHIC_ALIASES`, `HELD_POLYGONS`) before committing a new copy, because
a renamed polygon changes which 313.events label a venue receives.

## The names

The City's 205 polygon names and 313.events' neighborhood labels are two
different lists, kept apart on purpose. The polygon is geography: where a
point is. A label is what the site shows, and some labels are cultural or
historic names with no polygon. A venue's geography line records the polygon
its point fell in; a label is assigned only by these rules
(`api/_lib/detroit-geography.js`):

- **Same name** (ignoring punctuation: "Boston Edison" / "Boston-Edison"):
  the polygon is that label. 37 labels.
- **Approved geographic alias**: Rivertown is "Rivertown-Warehouse District";
  Arden Park is "Arden Park-East Boston". The labels keep their names.
- **Held for a decision**: Grandmont, Grandmont #1, Rosedale Park and North
  Rosedale Park (for "Grandmont-Rosedale"), and Mexicantown (for "Mexicantown
  / Southwest Detroit", which is deliberately broader than that polygon).
- **Assigned by a person only**: The District Detroit, Cass Corridor,
  Bricktown Historic District, Eastside Historic Cemetery District,
  Grandmont-Rosedale, Mexicantown / Southwest Detroit.
- **No label of that name**: nothing is assigned and no label is created; the
  polygon is recorded on the venue and reported.
