-- =========================================================================
-- Modula: Student Onboarding & Active Device Registry
-- Run this in your Supabase SQL Editor (left sidebar > SQL Editor > New query)
-- =========================================================================

-- 1. Create the student_profiles table
create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  student_email text not null,
  university_domain text,
  device_id text not null,
  platform text,
  app_version text,
  last_active_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 2. Enable Row-Level Security (RLS)
alter table public.student_profiles enable row level security;

-- 3. Policy: Allow authenticated students to insert and update their own device
drop policy if exists "Allow student to manage own device" on public.student_profiles;
create policy "Allow student to manage own device"
  on public.student_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Automatic profile trigger when student confirms OTP
create or replace function public.handle_new_student()
returns trigger as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.student_profiles (
      user_id,
      student_email,
      university_domain,
      device_id,
      platform,
      app_version,
      last_active_at
    )
    values (
      new.id,
      new.email,
      split_part(new.email, '@', 2),
      coalesce(new.raw_user_meta_data->>'device_id', 'unknown'),
      coalesce(new.raw_user_meta_data->>'platform', 'unknown'),
      coalesce(new.raw_user_meta_data->>'app_version', '1.0.2'),
      now()
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function whenever an auth user is created or confirmed
drop trigger if exists on_auth_student_created on auth.users;
create trigger on_auth_student_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_student();
