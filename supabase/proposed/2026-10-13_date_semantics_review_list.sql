-- DATE SEMANTICS: READ-ONLY REVIEW LIST (safe to run any time; SELECT only).
-- Transition strategy for existing rows: every unclassified (date_semantics IS NULL) row keeps
-- behaving exactly as before. Ambiguous ones are listed here for a person to classify. Nothing is
-- removed or hidden by this list. Classification needs source evidence (issue #48: no inferred recurrence).
-- Priority: multi-day + a stated clock time + not all-day (may be a nightly run, a series, or one
-- continuous exhibition). Longest spans first.
select left(id::text, 8) as id8, title, venue_name_raw, source, start_date, end_date,
       (end_date - start_date) as span_days, time_display, is_recurring
from public.events
where status = 'approved'
  and date_semantics is null
  and end_date > start_date
  and coalesce(end_date, start_date) >= current_date
  and coalesce(is_all_day, false) = false
  and time_display is not null
order by (end_date - start_date) desc, start_date;
