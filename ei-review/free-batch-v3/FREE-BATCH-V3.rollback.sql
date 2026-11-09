-- 313.events FREE correction batch v3 (36 adds, no removals). PROPOSAL ONLY. NOT EXECUTED. Needs exact owner GO + P1.
-- ROLLBACK: exact inverse with the same guard.
-- Guard: scripts/owner-supplied-row.js pattern; one DO block = one transaction; any row_count <> 1 raises and rolls back everything.
DO $$
DECLARE n integer;
BEGIN
  UPDATE events SET is_free = false WHERE id = '09c66613-6dce-4b36-a40f-879e395bd05d' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '09c66613-6dce-4b36-a40f-879e395bd05d', n; END IF;
  UPDATE events SET is_free = false WHERE id = '1f5d6e64-63ea-43ca-a6e8-c7b9a4fe8d09' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '1f5d6e64-63ea-43ca-a6e8-c7b9a4fe8d09', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'bbef84eb-9c66-490b-91c8-fcdb75f5b8ff' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'bbef84eb-9c66-490b-91c8-fcdb75f5b8ff', n; END IF;
  UPDATE events SET is_free = false WHERE id = '2d5f74f8-cf80-4970-895a-4d9a3e0a40ce' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '2d5f74f8-cf80-4970-895a-4d9a3e0a40ce', n; END IF;
  UPDATE events SET is_free = false WHERE id = '062e4d6b-1b7a-45d9-8ab9-511a98ed411c' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '062e4d6b-1b7a-45d9-8ab9-511a98ed411c', n; END IF;
  UPDATE events SET is_free = false WHERE id = '8899672e-086d-4ba5-97c2-fbc049d750c7' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '8899672e-086d-4ba5-97c2-fbc049d750c7', n; END IF;
  UPDATE events SET is_free = false WHERE id = '09c5ac18-4df8-40b0-ae94-f83eb725c419' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '09c5ac18-4df8-40b0-ae94-f83eb725c419', n; END IF;
  UPDATE events SET is_free = false WHERE id = '7f2a60dc-6f74-4fab-aa6f-fb439f029b82' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '7f2a60dc-6f74-4fab-aa6f-fb439f029b82', n; END IF;
  UPDATE events SET is_free = false WHERE id = '871b8457-8c06-4704-b12d-ed9476e3b51f' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '871b8457-8c06-4704-b12d-ed9476e3b51f', n; END IF;
  UPDATE events SET is_free = false WHERE id = '398011cc-78b2-416e-ab8d-514d0ea57928' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '398011cc-78b2-416e-ab8d-514d0ea57928', n; END IF;
  UPDATE events SET is_free = false WHERE id = '86131dab-2467-4a24-bdc9-b9cfc234f783' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '86131dab-2467-4a24-bdc9-b9cfc234f783', n; END IF;
  UPDATE events SET is_free = false WHERE id = '524b3a60-9971-4a2c-bc40-592b3a28ba9c' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '524b3a60-9971-4a2c-bc40-592b3a28ba9c', n; END IF;
  UPDATE events SET is_free = false WHERE id = '21e5afd4-324f-450a-ad3a-35b26a0c59d7' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '21e5afd4-324f-450a-ad3a-35b26a0c59d7', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'ea179197-6a5c-4756-afd7-d18cb6f9004b' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'ea179197-6a5c-4756-afd7-d18cb6f9004b', n; END IF;
  UPDATE events SET is_free = false WHERE id = '092e7a39-5ca8-4849-8fc3-6b3d1b9b11d8' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '092e7a39-5ca8-4849-8fc3-6b3d1b9b11d8', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'b7f2ed57-9c90-4bc6-a0cf-591131015087' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'b7f2ed57-9c90-4bc6-a0cf-591131015087', n; END IF;
  UPDATE events SET is_free = false WHERE id = '2a19b3da-dd17-4c0d-b7f6-5458a41ed365' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '2a19b3da-dd17-4c0d-b7f6-5458a41ed365', n; END IF;
  UPDATE events SET is_free = false WHERE id = '8ef9e221-c32a-4a8f-b9b5-52234cec3763' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '8ef9e221-c32a-4a8f-b9b5-52234cec3763', n; END IF;
  UPDATE events SET is_free = false WHERE id = '5f79aa3f-e050-4b08-9941-b3678a43c866' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '5f79aa3f-e050-4b08-9941-b3678a43c866', n; END IF;
  UPDATE events SET is_free = false WHERE id = '15ece4af-a71d-4f43-b129-db115f8e2f61' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '15ece4af-a71d-4f43-b129-db115f8e2f61', n; END IF;
  UPDATE events SET is_free = false WHERE id = '4c4cb963-0b6f-4a6b-9981-00bae84b610d' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '4c4cb963-0b6f-4a6b-9981-00bae84b610d', n; END IF;
  UPDATE events SET is_free = false WHERE id = '759f8e54-92fc-4cb3-83eb-d935717e15c7' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '759f8e54-92fc-4cb3-83eb-d935717e15c7', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'a8259cbc-2dad-4812-a2b5-b05270acd695' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'a8259cbc-2dad-4812-a2b5-b05270acd695', n; END IF;
  UPDATE events SET is_free = false WHERE id = '814f6985-f6d8-40c0-8eb8-3ee5076d7a7d' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '814f6985-f6d8-40c0-8eb8-3ee5076d7a7d', n; END IF;
  UPDATE events SET is_free = false WHERE id = '36064bbd-8ac9-4a16-acba-c57a664c8d2a' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '36064bbd-8ac9-4a16-acba-c57a664c8d2a', n; END IF;
  UPDATE events SET is_free = false WHERE id = '69688497-b36a-424b-a713-aa7046f50f83' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '69688497-b36a-424b-a713-aa7046f50f83', n; END IF;
  UPDATE events SET is_free = false WHERE id = '8859c93b-531d-4683-93ed-2c5409f25797' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '8859c93b-531d-4683-93ed-2c5409f25797', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'c0e1cc07-ba4c-441a-88d9-9c4bdc454bbc' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'c0e1cc07-ba4c-441a-88d9-9c4bdc454bbc', n; END IF;
  UPDATE events SET is_free = false WHERE id = '4bcd4af5-9901-403c-92ee-3675012978af' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '4bcd4af5-9901-403c-92ee-3675012978af', n; END IF;
  UPDATE events SET is_free = false WHERE id = '68fa6e5f-3695-46be-84a5-2c519ed6a61f' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '68fa6e5f-3695-46be-84a5-2c519ed6a61f', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'd41c03a1-9a86-4f11-a138-44191a55a5bc' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'd41c03a1-9a86-4f11-a138-44191a55a5bc', n; END IF;
  UPDATE events SET is_free = false WHERE id = '83c92321-d42e-478a-9b8d-844ca7d709e2' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '83c92321-d42e-478a-9b8d-844ca7d709e2', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'a587229a-e5f7-4ce3-9cff-be1fb3eab718' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'a587229a-e5f7-4ce3-9cff-be1fb3eab718', n; END IF;
  UPDATE events SET is_free = false WHERE id = '7cd691d5-45b5-4cef-aaf7-100939b1972e' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', '7cd691d5-45b5-4cef-aaf7-100939b1972e', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'd1992cbf-48b0-4ccd-97aa-5037aff4a731' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'd1992cbf-48b0-4ccd-97aa-5037aff4a731', n; END IF;
  UPDATE events SET is_free = false WHERE id = 'f24370b1-2c67-459b-a930-401f78a8ca6a' AND is_free = true
    AND COALESCE(internal_note,'') !~* '(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)' AND lower(btrim(coalesce(source,''))) <> 'manual';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'row % hit % rows (expected 1): stale or owner-locked', 'f24370b1-2c67-459b-a930-401f78a8ca6a', n; END IF;
END $$;
