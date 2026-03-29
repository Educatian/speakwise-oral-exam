# SpeakWise Deployment Checklist

This checklist is for production-style institutional deployment of SpeakWise.
It assumes the app will be used by one or more institutions, each with scoped courses,
role-based access, app-managed sign-in, and Supabase-backed persistence.

## 1. Infrastructure Setup

- Create a dedicated Supabase project for the environment.
- Run [supabase/production_schema.sql](C:\Users\jewoo\Desktop\speakwise1.1\speakwise-oral-exam\supabase\production_schema.sql) in the Supabase SQL editor.
- Confirm the RPC functions exist:
  - `list_active_institutions`
  - `validate_institution_access_code`
  - `register_app_user`
  - `authenticate_app_user`
  - `update_app_user_school`
  - `set_app_user_role`

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

## 4. Seed App Accounts and Staff

- Create the initial admin account in `public.app_users`.
- Store the password hash in `public.app_user_credentials`.
- Create instructor accounts in `public.app_users` and set their role to `instructor`.
- For each instructor, set `school_id` and `school_name`.
- Use `moderator` only for cross-institution or support staff.

## 5. Security Validation

- Confirm RLS is enabled on all tables:
  - `institutions`
  - `app_users`
  - `app_user_credentials`
  - `instructors`
  - `courses`
  - `submissions`
  - `submission_reviews`
  - `student_history`
- Verify the app can sign in without Supabase Auth.
- Verify institution and role filtering still works in the UI.
- Confirm the deployment team understands that access control is now app-managed rather than Supabase session-managed.

## 6. App Smoke Test

- Sign up a new student account and select an institution.
- Sign in as a seeded instructor.
- Create a course under the instructor’s institution.
- Confirm the course appears only for the correct institution.
- Run one full interview session.
- Confirm submission is written to:
  - `submissions`
  - `student_history`
- Save one instructor validation or override and confirm it is written to:
  - `submission_reviews`
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
- Assign instructor `app_users.school_id`.
- Have instructors create institution-scoped courses.
- Distribute the institution access code to students.
- Validate student onboarding with one pilot class before wider rollout.

## 9. Operational Monitoring

- Watch failed app sign-in attempts and duplicate account creation errors.
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
