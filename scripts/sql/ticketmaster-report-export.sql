-- READ-ONLY export for scripts/ticketmaster-report.js. SELECT only; changes nothing.
-- Run in the Supabase SQL editor (or any read-only role), then "Download as JSON"
-- and pass the file as --existing. Do not paste results anywhere public.
-- Returns Ticketmaster rows plus every other non-rejected upcoming row (the
-- duplicate check needs both). Replace the date with the report date.
select id, title, start_date, end_date, time_display, is_all_day, source, external_id,
       status, venue_id, venue_name_raw, venue_address_raw, venue_city_raw,
       description, description_source, image_url, ticket_url, event_url,
       is_free, price_from, ticket_status, internal_note, created_at
  from events
 where source = 'Ticketmaster'
    or (source <> 'Ticketmaster' and status <> 'rejected' and start_date >= date '2026-10-12')
 order by id;
