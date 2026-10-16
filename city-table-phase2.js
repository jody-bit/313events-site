// city-table-phase2.js — Geographic Phase 2: sourced city-center coordinates for in-orbit
// cities that the map's LOCATIONS table did not have. Plain static include (same pattern as
// city-resolution.js); exposes one global `PHASE2_CITIES`, and `module.exports` in Node.
//
// Every point is the jurisdiction's own internal point from a government gazetteer, never
// estimated: US Census Bureau TIGERweb (Michigan, Ohio; layer 4 places, layer 1 county
// subdivisions for townships) or Natural Resources Canada CGN (Ontario). `featureId` is the
// GEOID / CGN id so each row can be re-queried. Researched by 03 Event Intelligence and
// independently re-queried by 04 Platform on 2026-10-15; R&Q verifies raw source responses
// before production release. Values: event-intelligence/geo-coverage/phase2-city-coordinates.json.
// `events` is the audit count and is used only by tests.
//
// NOT in this table, on purpose: Maidstone, ON (three gazetteer points more than 10 km apart).
//
// `sources` gates a BARE city name using the event's source feed as the jurisdiction evidence
// (see city-resolution.js). An explicit matching state in the string ("Tecumseh, ON") needs no gate.
(function (root) {
  "use strict";
  var PHASE2_CITIES = [
  {name:"Bowling Green", region:"Ohio", lat:41.379088, lng:-83.647921, jurisdiction:"City", source:"Census TIGERweb", featureId:"3907972", verified:"2026-10-15", events:246},
  {name:"Richmond", region:"Michigan", lat:42.8105584, lng:-82.7521734, jurisdiction:"City", source:"Census TIGERweb", featureId:"2668380", verified:"2026-10-15", events:47},
  {name:"Redford", region:"Michigan", lat:42.3947885, lng:-83.294018, jurisdiction:"Redford charter township", source:"Census TIGERweb", featureId:"2616367625", verified:"2026-10-15", events:26},
  {name:"Canton", region:"Michigan", lat:42.3075411, lng:-83.4857746, jurisdiction:"Canton charter township", source:"Census TIGERweb", featureId:"2616313120", verified:"2026-10-15", events:20},
  {name:"Plymouth", region:"Michigan", lat:42.3712455, lng:-83.4676165, jurisdiction:"City", source:"Census TIGERweb", featureId:"2665060", verified:"2026-10-15", events:14},
  {name:"Leamington", region:"Ontario", lat:42.09535, lng:-82.55906, jurisdiction:"Municipality (Town) of Leamington, Essex County", source:"NRCan CGN", featureId:"FEVJN", verified:"2026-10-15", events:7},
  {name:"Belleville", region:"Michigan", lat:42.1984979, lng:-83.4799575, jurisdiction:"City", source:"Census TIGERweb", featureId:"2607020", verified:"2026-10-15", events:6},
  {name:"Macomb", region:"Michigan", lat:42.6748636, lng:-82.9181698, jurisdiction:"Macomb township", source:"Census TIGERweb", featureId:"2609950480", verified:"2026-10-15", events:5},
  {name:"Garden City", region:"Michigan", lat:42.3243828, lng:-83.3411923, jurisdiction:"City", source:"Census TIGERweb", featureId:"2631420", verified:"2026-10-15", events:4},
  {name:"Melvindale", region:"Michigan", lat:42.2786889, lng:-83.1821595, jurisdiction:"City", source:"Census TIGERweb", featureId:"2652940", verified:"2026-10-15", events:3},
  {name:"LaSalle", region:"Ontario", lat:42.2252778, lng:-83.0480556, jurisdiction:"Town of LaSalle, Essex County", source:"NRCan CGN", featureId:"FERXE", verified:"2026-10-15", events:3},
  {name:"Lakeshore", region:"Ontario", lat:42.24812, lng:-82.68766, jurisdiction:"Town of Lakeshore, Essex County", source:"NRCan CGN", featureId:"FEUVZ", verified:"2026-10-15", events:3},
  {name:"Ecorse", region:"Michigan", lat:42.249592, lng:-83.1404393, jurisdiction:"City", source:"Census TIGERweb", featureId:"2624740", verified:"2026-10-15", events:2},
  {name:"Northville", region:"Michigan", lat:42.4361604, lng:-83.4876603, jurisdiction:"City", source:"Census TIGERweb", featureId:"2658980", verified:"2026-10-15", events:2},
  {name:"River Rouge", region:"Michigan", lat:42.2743459, lng:-83.1241616, jurisdiction:"City", source:"Census TIGERweb", featureId:"2668760", verified:"2026-10-15", events:2},
  {name:"Romulus", region:"Michigan", lat:42.2212613, lng:-83.3674371, jurisdiction:"City", source:"Census TIGERweb", featureId:"2669420", verified:"2026-10-15", events:2},
  {name:"Wayne", region:"Michigan", lat:42.2769132, lng:-83.3881483, jurisdiction:"City", source:"Census TIGERweb", featureId:"2684940", verified:"2026-10-15", events:2},
  {name:"Inkster", region:"Michigan", lat:42.2939448, lng:-83.320298, jurisdiction:"City", source:"Census TIGERweb", featureId:"2640680", verified:"2026-10-15", events:2},
  {name:"Huron", region:"Ohio", lat:41.3976309, lng:-82.5625689, jurisdiction:"City", source:"Census TIGERweb", featureId:"3937016", verified:"2026-10-15", events:2},
  {name:"Essex", region:"Ontario", lat:42.0941666, lng:-82.9008333, jurisdiction:"Town of Essex, Essex County", source:"NRCan CGN", featureId:"FEVJL", verified:"2026-10-15", events:2},
  {name:"Tecumseh", region:"Ontario", lat:42.2430555, lng:-82.9255556, jurisdiction:"Town of Tecumseh, Essex County", source:"NRCan CGN", featureId:"FEVJO", verified:"2026-10-15", events:2},
  {name:"Kingsville", region:"Ontario", lat:42.10368, lng:-82.72962, jurisdiction:"Town of Kingsville, Essex County", source:"NRCan CGN", featureId:"FEVJM", verified:"2026-10-15", events:2},
  {name:"West Bloomfield", region:"Michigan", lat:42.5666956, lng:-83.3870949, jurisdiction:"West Bloomfield charter township", source:"Census TIGERweb", featureId:"2612585480", verified:"2026-10-15", events:1},
  {name:"Hazel Park", region:"Michigan", lat:42.4619261, lng:-83.0976927, jurisdiction:"City", source:"Census TIGERweb", featureId:"2637420", verified:"2026-10-15", events:1},
  {name:"Lake Orion", region:"Michigan", lat:42.7842202, lng:-83.2455417, jurisdiction:"Village", source:"Census TIGERweb", featureId:"2644940", verified:"2026-10-15", events:1},
  {name:"Lathrup Village", region:"Michigan", lat:42.4920759, lng:-83.2272835, jurisdiction:"City", source:"Census TIGERweb", featureId:"2646320", verified:"2026-10-15", events:1},
  {name:"Oxford", region:"Michigan", lat:42.8214262, lng:-83.253462, jurisdiction:"Village", source:"Census TIGERweb", featureId:"2662020", verified:"2026-10-15", events:1},
  {name:"Onsted", region:"Michigan", lat:42.0060958, lng:-84.1893476, jurisdiction:"Village", source:"Census TIGERweb", featureId:"2660840", verified:"2026-10-15", events:1},
  {name:"Amherstburg", region:"Ontario", lat:42.1172222, lng:-83.0441666, jurisdiction:"Town of Amherstburg, Essex County", source:"NRCan CGN", featureId:"FEVJQ", verified:"2026-10-15", events:1},
  {name:"Harrow", region:"Ontario", lat:42.0355556, lng:-82.9183333, jurisdiction:"Unincorporated place (community in the Town of Essex)", source:"NRCan CGN", featureId:"FBMCG", verified:"2026-10-15", events:1},
  ];

  // Source feeds that are jurisdiction evidence for each city (03 Event Intelligence,
  // phase2-matching-rules.csv). A bare city name resolves only when the event's source is
  // listed: Canton, Plymouth, Wayne, Richmond, Oxford, Huron, Tecumseh, Essex, Bowling Green
  // and the rest also exist as other places, so the name alone is not evidence.
  var SOURCES = {
      "Bowling Green": [
          "Bowling Green State University",
          "Ticketmaster"
      ],
      "Richmond": [
          "Richmond Recreation Calendar"
      ],
      "Redford": [
          "Redford Township Community Events",
          "Facebook Event Export"
      ],
      "Canton": [
          "Canton Township Community and Special Events",
          "VisitDetroit"
      ],
      "Plymouth": [
          "Ticketmaster",
          "City of Livonia - Community Events",
          "Bowling Green State University",
          "VisitDetroit"
      ],
      "Leamington": [
          "Tourism Windsor Essex Pelee Island",
          "Windsor Symphony Orchestra"
      ],
      "Belleville": [
          "Ticketmaster",
          "Redford Township Community Events"
      ],
      "Macomb": [
          "Macomb Township Events"
      ],
      "Garden City": [
          "Garden City Community Events"
      ],
      "Melvindale": [
          "Eastern Market Partnership",
          "VisitDetroit"
      ],
      "LaSalle": [
          "Tourism Windsor Essex Pelee Island"
      ],
      "Lakeshore": [
          "Tourism Windsor Essex Pelee Island"
      ],
      "Ecorse": [
          "Eastern Market Partnership"
      ],
      "Northville": [
          "City of Northville Events"
      ],
      "River Rouge": [
          "Eastern Market Partnership"
      ],
      "Romulus": [
          "Eastern Market Partnership"
      ],
      "Wayne": [
          "Eastern Market Partnership",
          "Facebook Event Export"
      ],
      "Huron": [
          "Bowling Green State University"
      ],
      "Essex": [
          "Tourism Windsor Essex Pelee Island"
      ],
      "Tecumseh": [
          "Tourism Windsor Essex Pelee Island",
          "Windsor Symphony Orchestra"
      ],
      "Kingsville": [
          "Tourism Windsor Essex Pelee Island"
      ],
      "Inkster": [
          "Eastern Market Partnership"
      ],
      "West Bloomfield": [
          "VisitDetroit"
      ],
      "Hazel Park": [
          "Manual"
      ],
      "Lake Orion": [
          "VisitDetroit"
      ],
      "Lathrup Village": [
          "Editorial Review"
      ],
      "Oxford": [
          "VisitDetroit"
      ],
      "Onsted": [
          "Facebook Event Export"
      ],
      "Amherstburg": [
          "Tourism Windsor Essex Pelee Island"
      ],
      "Harrow": [
          "Tourism Windsor Essex Pelee Island"
      ]
  };
  PHASE2_CITIES.forEach(function (c) {
    var list = SOURCES[c.name];
    if (!list || !list.length) throw new Error("Phase 2 city without evidence sources: " + c.name);
    c.sources = list.map(function (x) { return x.toLowerCase(); });
  });

  if (typeof module !== "undefined" && module.exports) module.exports = { PHASE2_CITIES: PHASE2_CITIES };
  else (typeof window !== "undefined" ? window : globalThis).PHASE2_CITIES = PHASE2_CITIES;
})(this);
