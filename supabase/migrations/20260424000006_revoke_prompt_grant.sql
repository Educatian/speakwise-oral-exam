-- Close the last deferred Track A item: revoke SELECT on courses.prompt
-- from anon/authenticated.
--
-- Students get the prompt back through course-login after passcode
-- validation. Instructors / admins get it through instructor-course-get
-- when opening a course they own. Both paths use the service-role client
-- from inside an Edge Function, which is not subject to the column grant.
--
-- Idempotent: REVOKE is a no-op if the grant isn't present.

revoke select (prompt) on public.courses from anon, authenticated;
