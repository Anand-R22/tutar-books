-- ═══════════════════════════════════════════════════════
-- Pathshala — Supabase Setup
-- Run this in the Supabase SQL Editor once
-- ═══════════════════════════════════════════════════════

-- Table for tracking teachers' uploaded PDFs
create table if not exists user_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  board text not null,
  class text not null,
  subject text not null,
  year text,
  kind text not null check (kind in ('textbook', 'question-paper')),
  file_url text not null,
  original_name text,
  created_at timestamptz default now()
);

-- Indexes for fast lookup
create index if not exists idx_user_uploads_user on user_uploads(user_id);
create index if not exists idx_user_uploads_filter on user_uploads(board, class, subject);

-- Row-level security: teachers only see their own uploads
alter table user_uploads enable row level security;

create policy "Users can view their own uploads"
  on user_uploads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own uploads"
  on user_uploads for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own uploads"
  on user_uploads for update
  using (auth.uid() = user_id);

create policy "Users can delete their own uploads"
  on user_uploads for delete
  using (auth.uid() = user_id);
