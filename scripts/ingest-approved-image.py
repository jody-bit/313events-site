#!/usr/bin/env python3
"""Prepare an Experience-approved destination photo for the site (no network, no Storage, no records changed).

Reads an approved image from the shared project folder, writes the card WebP into assets/seasonal/photos/<collection>/ using the
site's file naming, and prints the `image.acquired` block (bytes, sha256, pixel size) plus a provenance record for the editorial
entry. It never edits entries.json and never publishes: the output goes into a draft PR that Release & Quality reviews and the
owner approves.

  python3 scripts/ingest-approved-image.py --in /mnt/project-files/experience/.../derived/<file>.jpg \\
      --collection fall --id damouni-orchards --source-page https://www.damouniorchards.com/ --credit "Damouni Orchards (official site)" \\
      [--width 1280] [--name official-01] [--original <file>] [--crop "y=481..3694, full width"] [--review <review doc path>]

Needs Pillow (python3 -m pip install Pillow). Refuses to overwrite an existing asset. Re-run is a no-op only if you delete the output.
"""
import argparse, datetime, hashlib, json, os, re, sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python3 -m pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--collection", required=True, choices=["fall", "fall-color", "halloween"])
    ap.add_argument("--id", required=True, help="destination id, e.g. damouni-orchards")
    ap.add_argument("--name", default="official-01", help="variant label in the file name")
    ap.add_argument("--width", type=int, default=1280, help="card width in px (height keeps the aspect ratio)")
    ap.add_argument("--source-page", required=True)
    ap.add_argument("--credit", required=True)
    ap.add_argument("--original", default="", help="name and pixel size of the untouched original, for the record")
    ap.add_argument("--crop", default="", help="crop description, for the record")
    ap.add_argument("--review", default="", help="path of the image-review evidence")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    a = ap.parse_args()

    if not (SLUG.match(a.id) and SLUG.match(a.name)):
        sys.exit("--id and --name must be lowercase slugs")
    if not os.path.isfile(a.src):
        sys.exit("input not found: " + a.src)
    if not a.source_page.startswith("https://"):
        sys.exit("--source-page must be https")

    rel = f"assets/seasonal/photos/{a.collection}/{a.collection}__{a.id}__{a.name}__card.webp"
    out = os.path.join(ROOT, rel)
    if os.path.exists(out):
        sys.exit("refusing to overwrite " + rel)

    im = Image.open(a.src)
    im.load()
    src_w, src_h = im.size
    if src_w < a.width:
        sys.exit(f"input is {src_w}px wide, narrower than the requested {a.width}px card")
    h = round(src_h * a.width / src_w)
    card = im.convert("RGB").resize((a.width, h), Image.LANCZOS)  # convert() drops EXIF/GPS: nothing is carried over
    os.makedirs(os.path.dirname(out), exist_ok=True)
    card.save(out, "WEBP", quality=82, method=6)

    data = open(out, "rb").read()
    acquired = {"file": "/" + rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "width": a.width, "height": h, "acquiredAt": a.date}
    src_bytes = open(a.src, "rb").read()
    print(json.dumps({
        "image.acquired": acquired,
        "provenance": {
            "destination": a.id, "collection": a.collection, "sourcePage": a.source_page, "credit": a.credit,
            "approvedInput": {"file": os.path.basename(a.src), "sha256": hashlib.sha256(src_bytes).hexdigest(), "width": src_w, "height": src_h},
            "original": a.original or None, "crop": a.crop or None, "reviewEvidence": a.review or None,
            "rights": "Not cleared. Recorded owner risk acceptance (DEC-029) is a separate step in the entry's image.remote.",
        },
    }, indent=1))


if __name__ == "__main__":
    main()
