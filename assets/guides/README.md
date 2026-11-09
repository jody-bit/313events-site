# Seasonal guide images

Optimized from the three supplied 1672x941 originals (1600w and 800w webp, 16:9). Shown today as the three static
cards of the homepage DON'T MISS rail (configured in data/dont-miss.json, non-navigating until /fall, /halloween and
/fall-color exist). The seasonal guide pages are designed separately.

| Files | Approved card copy | Alt text |
|---|---|---|
| `fall-guide-{1600,800}.webp` | DETROIT ORBIT FALL GUIDE. Cider mills. Pumpkin patches. Orchards. Donuts. Hayrides. Find your fall. EXPLORE FALL -> /fall | A wooden cider press pouring fresh cider beside baskets of apples and pumpkins, with a red barn and hayride at sunset. |
| `halloween-guide-{1600,800}.webp` | HALLOWEEN IN THE ORBIT. Haunts. Horror. Ghosts. Oddities. Family fun. Halloween across the Detroit Orbit. GET SPOOKY -> /halloween | Glowing jack-o'-lanterns and a scarecrow beside a foggy path leading visitors toward a haunted manor under a full moon. |
| `fall-color-guide-{1600,800}.webp` | FALL COLORS. Trails. Parks. Scenic drives. Waterfronts. Find the Detroit Orbit at peak color. CHASE COLOR -> /fall-color | Red and orange autumn maples above a river at sunset, with the Detroit skyline on the horizon. |

Known: each source image has a very faint small mark in its top-left corner (left untouched; rights and cleanliness
to be confirmed by the Product Owner).

## Off the Beaten Orbit tile (added 2026-11-05)
`off-the-beaten-orbit-guide-{1600,800}.webp` (16:9) are resized from the owner-supplied `source/off-the-beaten-orbit-detroit-urban-craft-fair-original.webp`
(1756x992, sha256 d2c9bdda4cd031b7cf0a74f0774b5db3649a2a5e3491d68ec3641e19d50aedbc, unmodified original kept). Chosen by Jody in the project thread
(2026-11-05 04:03Z). Subject per Jody (2026-11-05 04:03Z): the Detroit Urban Craft Fair (indoor maker market). Photographer, credit line and licence NOT recorded in the file;
shown with no visible credit per the promotional-photography default unless the source or Jody says a credit is required. Alt: "Shoppers browse rows of
independent maker booths in a large indoor craft fair hall." Faces are visible (crowd scene).

### Owner clearance record (2026-11-05 04:26Z)
Jody's instruction, recorded verbatim as relayed in the project thread (message cmsg_0139NVW4pFWSu54bJXVBHDMb4WVQ3RVLEFe1GBnnCBo7g7):
"photo credit is cleared - make it live" (Jody, in Codex). This clears the supplied DetroitUrbanCraftFair.webp for the Off the Beaten Orbit homepage tile, collection hero and the
Detroit Urban Craft Fair card. NO photographer, source URL or licence is recorded and none is asserted; no visible credit is shown. The card uses
`image.ownerClearance` (see seasonal/collections.js route 4e) with a 3:2 crop at assets/seasonal/off-the-beaten-orbit-ducf-card.webp (sha256 aa229a67ce74a18d6c850c6df7060ef24988347f2542a1dd5f6e602e08e9c8cc).

### Pewabic Holiday Showcase card image (2026-11-06)
Owner-supplied promotional artwork, not owner-photographed. Jody supplied `pewabic_snowflakes_2022-1.png.webp` in the project timeline (cmsg_0139NVW4pFWSu54bJXVBHDMb26FraywzmHT3i3uKiktRrD, 2026-11-06 01:28Z) and asked for it to be used for the Pewabic Holiday Showcase.
The "2022" in the file name is not an event year: no year or date is inferred from it and the image is not claimed to depict 2026. Photographer, source URL and licence are NOT recorded and none is asserted; no visible credit is shown.
Original kept unmodified at `assets/guides/source/pewabic-holiday-showcase-snowflake-ornaments-original.webp` (1600x1600, 677798 bytes, sha256 84ff281931c327f00c645d792d2df29a36115de804a0445ac1fb3091ca1d038f).
Card: `assets/seasonal/pewabic-holiday-showcase-card.webp` is a 1600x1067 crop (y 260 to 1327; all three ornaments intact, ribbons trimmed at the top) resized to 1280x853 (sha256 ae737d1f36d6a6884cb81e5c47a1157a9d7f76d16f36c869ee2741437f1b1843), no upscaling.
Alt: "Three turquoise ceramic snowflake ornaments hanging from lavender ribbons, framed by evergreen and sage greenery on a dark background." (the card image renders with empty alt next to its title; the text is kept in `image.alt`).
Route: `image.ownerClearance` (seasonal/collections.js route 4e). This is image provenance only; it is not a publication approval.
