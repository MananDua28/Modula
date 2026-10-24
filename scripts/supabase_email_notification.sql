-- =========================================================================
-- Modula: Automated Email Notification on New Feedback / Issue Submission
-- Target Email: modula.auth@gmail.com
-- Run this in your Supabase SQL Editor:
--   Dashboard > Left Sidebar > SQL Editor > New query > Paste & Run
-- =========================================================================

-- =========================================================================
-- OPTION 1: Built-in Supabase Database Webhook (Fastest & Zero Setup)
-- =========================================================================
-- You can configure this directly in the Supabase Dashboard:
-- 1. Go to: Database > Webhooks (or Integrations > Webhooks)
-- 2. Click "Create a webhook":
--    - Name: "Notify Modula Feedback"
--    - Table: "feedback"
--    - Events: Check "Insert"
--    - Webhook Type: HTTP Request (POST)
--    - URL: Your Zapier / Make / Webhook endpoint configured to forward to modula.auth@gmail.com
--
-- =========================================================================
-- OPTION 2: Automated Email via Resend API (Direct SQL Trigger)
-- =========================================================================
-- Resend is the official email provider partner of Supabase (free tier: 3,000 emails/month).
-- Step 1: Sign up free at https://resend.com and grab your API key (starts with re_...).
-- Step 2: Replace 're_YOUR_RESEND_API_KEY_HERE' below and execute this script.

-- Enable pg_net extension for async non-blocking HTTP requests
create extension if not exists pg_net;

-- Create the notification function
create or replace function public.notify_on_new_feedback()
returns trigger as $$
declare
  resend_key text := 're_YOUR_RESEND_API_KEY_HERE'; -- Replace with your Resend API Key
  email_subject text;
  email_content text;
begin
  email_subject := 'New Modula Support Request from ' || coalesce(new.student_email, 'Student');
  
  email_content := format(
    'New feedback received for Modula:<br><br>' ||
    '<strong>Student Email:</strong> %s<br>' ||
    '<strong>Platform:</strong> %s<br>' ||
    '<strong>App Version:</strong> %s<br>' ||
    '<strong>Date:</strong> %s<br><br>' ||
    '<strong>Details:</strong><br><pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-family:monospace;">%s</pre>',
    new.student_email,
    coalesce(new.platform, 'Web'),
    coalesce(new.app_version, 'web-landing-v1.0.4'),
    to_char(new.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'),
    new.message
  );

  -- Dispatch asynchronous HTTP POST to Resend
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Modula Alerts <onboarding@resend.dev>',
      'to', array['modula.auth@gmail.com'],
      'reply_to', new.student_email,
      'subject', email_subject,
      'html', email_content
    )
  );

  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to public.feedback on INSERT
drop trigger if exists on_feedback_created on public.feedback;
create trigger on_feedback_created
  after insert on public.feedback
  for each row execute function public.notify_on_new_feedback();
