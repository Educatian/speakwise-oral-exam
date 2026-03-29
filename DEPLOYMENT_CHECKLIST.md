# SpeakWise Deployment Checklist

This checklist is for production-style institutional deployment of SpeakWise.
It assumes the app will be used by one or more institutions, each with scoped courses,
role-based access, and Supabase-backed persistence.

## 1. Infrastructure Setup

- Create a dedicated Supabase project for the environment.
- Enable Email auth in Supabase Authentication.
- Set the site URL and redirect URLs for your deployment domain.
- Run [supabase/production_schema.sql](C:\Users\jewoo\Desktop\speakwise1.1\speakwise-oral-exam\supabase\production_schema.sql) in the Supabase SQL editor.
- Confirm the RPC functions exist:
  - `list_active_institutions`
  - `validate_institution_access_code`

## 2. Environment Variables

- Set `GEMINI_API_KEY`
- Set `VITE_SUPABASE_URL`
- Set `VITE_SUPABASE_ANON_KEY`
- Verify the same values are configured in the deployment platform.

## 3. Seed Institutional Data

- Insert each institution into `public.institutions`.
- Give each institution a unique `id`.
- Assign an `access_code` for student institution selection.
- Add branding values if desired:
  - `logo_url`
  - `primary_color`
  - `domain`

## 4. Seed Admins and Staff

- Create the initial admin user through Supabase Auth.
- Insert or update that user in `public.user_profiles` with role `admin`.
- Create instructor accounts and set their role to `instructor`.
- For each instructor, set `school_id` and `school_name`.
- Use `moderator` only for cross-institution or support staff.

## 5. Security Validation

- Confirm RLS is enabled on all tables:
  - `institutions`
  - `user_profiles`
  - `instructors`
  - `courses`
  - `submissions`
  - `student_history`
- Verify a student can only read:
  - their own profile
  - their own history
  - courses in their institution
- Verify an instructor can only manage:
  - their own courses
  - institution-scoped data they are allowed to see
- Verify an admin can manage all institutions and roles.

## 6. App Smoke Test

- Sign up a new student account and select an institution.
- Sign in as a seeded instructor.
- Create a course under the instructor’s institution.
- Confirm the course appears only for the correct institution.
- Run one full interview session.
- Confirm submission is written to:
  - `submissions`
  - `student_history`
- Confirm the student can see results and history.
- Confirm the instructor can review that submission.

## 7. Audio and AI Validation

- Test microphone permission prompt in the deployed domain.
- Run a real Gemini live interview.
- Confirm transcription, scoring, and feedback generation work.
- Confirm failure cases show a usable fallback message.

## 8. Institution Rollout Process

- Create the institution row.
- Create or import instructor accounts.
- Assign instructor `user_profiles.school_id`.
- Have instructors create institution-scoped courses.
- Distribute the institution access code to students.
- Validate student onboarding with one pilot class before wider rollout.

## 9. Operational Monitoring

- Watch Supabase auth failures.
- Watch database row growth for:
  - `submissions`
  - `student_history`
- Track Gemini API usage and quota.
- Decide retention rules for transcripts and analytics.
- Decide whether old student history should be archived or deleted.

## 10. Recommended Next Improvements

- Move Gemini calls behind a server or edge proxy for stronger key protection.
- Add audit logging for role changes and course deletion.
- Add course templates by institution.
- Add enrollment tables instead of institution-only course visibility.
- Add an institution admin dashboard for onboarding and support.
