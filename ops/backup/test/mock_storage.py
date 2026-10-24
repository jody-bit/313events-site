#!/usr/bin/env python3
"""Tiny stand-in for the Supabase Storage REST API, for offline tests. Usage: mock_storage.py PORT ROOTDIR KEY [FAIL_SUBSTR] [DB_NAME]
Requires the apikey header to equal KEY (proves the key reaches curl through its config pipe). POSTed objects are also
inserted into DB_NAME's storage.objects (via psql and the PG* environment) so the restore script's row check has data."""
import http.server, os, subprocess, sys, urllib.parse, json
port, root, key = int(sys.argv[1]), sys.argv[2], sys.argv[3]
fail = sys.argv[4] if len(sys.argv) > 4 else ""
dbname = sys.argv[5] if len(sys.argv) > 5 else ""
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _auth(self):
        if self.headers.get("apikey") != key or self.headers.get("Authorization") != "Bearer " + key:
            self.send_response(401); self.end_headers(); return False
        return True
    def _path(self):
        p = urllib.parse.unquote(self.path.split("?")[0])
        return p.split("/storage/v1/object/", 1)[1] if "/storage/v1/object/" in p else None
    def do_GET(self):
        if not self._auth(): return
        rel = self._path()
        f = os.path.join(root, rel) if rel else None
        if rel is None or (fail and fail in rel) or not os.path.isfile(f):
            self.send_response(404); self.end_headers(); return
        data = open(f, "rb").read()
        self.send_response(200); self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        if not self._auth(): return
        n = int(self.headers.get("content-length", 0)); body = self.rfile.read(n)
        rel = self._path()
        if rel:
            f = os.path.join(root, rel); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, "wb").write(body)
            if dbname:
                b, name = rel.split("/", 1)
                sql = "insert into storage.objects(bucket_id,name,metadata) values (%s,%s,%s::jsonb)" % tuple(
                    "'" + x.replace("'", "''") + "'" for x in (b, name, json.dumps({"size": len(body)})))
                subprocess.run(["psql", "dbname=" + dbname, "-X", "-q", "-c", sql], check=True)
        self.send_response(200); self.send_header("content-length", "2"); self.end_headers(); self.wfile.write(b"{}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
