-- ============================================================
-- FitTrainer MVP — Initial Schema
-- ============================================================

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null check (role in ('trainer', 'client')),
  trainer_id uuid references public.profiles(id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  plan_started_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Invites
create table public.invites (
  id uuid default gen_random_uuid() primary key,
  token text unique not null,
  trainer_id uuid references public.profiles(id) on delete cascade not null,
  used_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Workouts
create table public.workouts (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  default_rest_sec integer default 90,
  created_at timestamptz default now()
);

-- Exercise library (filled once by seed script)
create table public.exercises_library (
  id uuid default gen_random_uuid() primary key,
  external_id text unique not null,
  name_ru text not null,
  name_en text not null,
  category text not null,
  equipment text,
  image_urls text[],
  source text default 'free-exercise-db'
);

-- Exercises in a specific workout
create table public.exercises (
  id uuid default gen_random_uuid() primary key,
  workout_id uuid references public.workouts(id) on delete cascade not null,
  library_exercise_id uuid references public.exercises_library(id) not null,
  sets integer not null,
  reps integer not null,
  weight_kg numeric(6,2) not null default 0,
  rest_sec integer,
  trainer_note text,
  "order" integer not null
);

-- Workout assignments to clients
create table public.assigned_workouts (
  id uuid default gen_random_uuid() primary key,
  workout_id uuid references public.workouts(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  assigned_at timestamptz default now(),
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed'))
);

-- Results per exercise in a completed/in-progress workout
create table public.exercise_results (
  id uuid default gen_random_uuid() primary key,
  assigned_workout_id uuid references public.assigned_workouts(id) on delete cascade not null,
  exercise_id uuid references public.exercises(id) on delete cascade not null,
  actual_reps integer,
  actual_weight_kg numeric(6,2),
  completed boolean not null default false,
  client_note text
);

-- Plan limits (all null = unlimited in MVP)
create table public.plan_limits (
  plan text primary key,
  max_clients integer,
  max_workouts integer,
  max_exercises_per_workout integer,
  max_invites_active integer
);

insert into public.plan_limits values
  ('free', null, null, null, null),
  ('pro',  null, null, null, null),
  ('team', null, null, null, null);

-- Subscriptions placeholder (not used in MVP, ready for payment provider)
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan text not null,
  status text not null check (status in ('active', 'cancelled', 'expired', 'pending')),
  provider text,
  provider_subscription_id text,
  started_at timestamptz default now(),
  expires_at timestamptz,
  cancelled_at timestamptz
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises_library enable row level security;
alter table public.exercises enable row level security;
alter table public.assigned_workouts enable row level security;
alter table public.exercise_results enable row level security;
alter table public.plan_limits enable row level security;
alter table public.subscriptions enable row level security;

-- profiles: user sees own profile + trainer's profile + own clients' profiles
create policy "profiles_select" on public.profiles for select using (
  auth.uid() = id
  or auth.uid() = trainer_id
  or id in (select id from public.profiles where trainer_id = auth.uid())
);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- invites: trainer sees and manages own invites
create policy "invites_select" on public.invites for select using (
  trainer_id = auth.uid()
  or (used_by is null and expires_at > now())  -- allow reading valid invite when registering
);
create policy "invites_insert" on public.invites for insert with check (trainer_id = auth.uid());
create policy "invites_update" on public.invites for update using (
  trainer_id = auth.uid()
  or (used_by is null and expires_at > now())  -- client can claim an unused invite
);

-- workouts: trainer sees own; client sees assigned ones
create policy "workouts_select" on public.workouts for select using (
  trainer_id = auth.uid()
  or id in (select workout_id from public.assigned_workouts where client_id = auth.uid())
);
create policy "workouts_insert" on public.workouts for insert with check (trainer_id = auth.uid());
create policy "workouts_update" on public.workouts for update using (trainer_id = auth.uid());
create policy "workouts_delete" on public.workouts for delete using (trainer_id = auth.uid());

-- exercises_library: public read
create policy "exercises_library_select" on public.exercises_library for select using (true);

-- exercises: trainer sees own workout exercises; client sees exercises of assigned workouts
create policy "exercises_select" on public.exercises for select using (
  workout_id in (select id from public.workouts where trainer_id = auth.uid())
  or workout_id in (select workout_id from public.assigned_workouts where client_id = auth.uid())
);
create policy "exercises_insert" on public.exercises for insert with check (
  workout_id in (select id from public.workouts where trainer_id = auth.uid())
);
create policy "exercises_update" on public.exercises for update using (
  workout_id in (select id from public.workouts where trainer_id = auth.uid())
);
create policy "exercises_delete" on public.exercises for delete using (
  workout_id in (select id from public.workouts where trainer_id = auth.uid())
);

-- assigned_workouts: trainer sees own clients'; client sees own
create policy "assigned_workouts_select" on public.assigned_workouts for select using (
  client_id = auth.uid()
  or workout_id in (select id from public.workouts where trainer_id = auth.uid())
);
create policy "assigned_workouts_insert" on public.assigned_workouts for insert with check (
  workout_id in (select id from public.workouts where trainer_id = auth.uid())
);
create policy "assigned_workouts_update" on public.assigned_workouts for update using (
  client_id = auth.uid()  -- client marks as completed
  or workout_id in (select id from public.workouts where trainer_id = auth.uid())
);

-- exercise_results: client owns; trainer can read
create policy "exercise_results_select" on public.exercise_results for select using (
  assigned_workout_id in (select id from public.assigned_workouts where client_id = auth.uid())
  or assigned_workout_id in (
    select aw.id from public.assigned_workouts aw
    join public.workouts w on w.id = aw.workout_id
    where w.trainer_id = auth.uid()
  )
);
create policy "exercise_results_insert" on public.exercise_results for insert with check (
  assigned_workout_id in (select id from public.assigned_workouts where client_id = auth.uid())
);
create policy "exercise_results_update" on public.exercise_results for update using (
  assigned_workout_id in (select id from public.assigned_workouts where client_id = auth.uid())
);

-- plan_limits: public read
create policy "plan_limits_select" on public.plan_limits for select using (true);

-- subscriptions: user sees own
create policy "subscriptions_select" on public.subscriptions for select using (user_id = auth.uid());

-- ============================================================
-- Auto-create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- profile is created manually in registration flow with name+role
  -- this function is a safety net if needed
  return new;
end;
$$;
