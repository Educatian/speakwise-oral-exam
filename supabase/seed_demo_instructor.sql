-- One-line seed: grant the demo guidebook instructor the instructor role.
-- The handle_new_user trigger reads this table at signup, so after this the
-- email demo.instructor@speakwise-test.com will become an instructor when it
-- signs up through the app. Safe/additive. Run in Supabase SQL Editor.
insert into public.instructors (email, institution_id, added_by)
values ('demo.instructor@speakwise-test.com', 'demo', 'jewoong.moon@gmail.com')
on conflict (email) do nothing;
