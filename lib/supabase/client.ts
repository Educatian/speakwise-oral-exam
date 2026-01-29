import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// Supabase Configuration
// ═══════════════════════════════════════════════════════════════════════════
// 
// To set up Supabase:
// 1. Go to https://supabase.com and sign up/login
// 2. Create a new project
// 3. Go to Project Settings > API
// 4. Copy the Project URL and anon/public key
// 5. Create tables using the SQL below
//
// ═══════════════════════════════════════════════════════════════════════════

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== '');
}

/**
 * Supabase client instance
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// ═══════════════════════════════════════════════════════════════════════════
// Database Schema SQL (Run this in Supabase SQL Editor)
// ═══════════════════════════════════════════════════════════════════════════
/*

-- Courses table
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions table
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  course_name TEXT,
  timestamp BIGINT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  feedback TEXT,
  -- Learning Analytics
  latency_metrics JSONB,
  barge_in_events JSONB,
  -- Advanced Reasoning Analytics
  dialogue_metrics JSONB,
  argument_graph JSONB,
  reasoning_rubric JSONB,
  -- AI Confidence
  confidence_score NUMERIC,
  rubric_breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student history table (device-based)
CREATE TABLE student_history (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_name TEXT,
  timestamp BIGINT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  feedback TEXT,
  -- Learning Analytics
  latency_metrics JSONB,
  barge_in_events JSONB,
  -- Advanced Reasoning Analytics
  dialogue_metrics JSONB,
  argument_graph JSONB,
  reasoning_rubric JSONB,
  -- AI Confidence
  confidence_score NUMERIC,
  rubric_breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) - Optional for development
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_history ENABLE ROW LEVEL SECURITY;

-- Allow public access for development (adjust for production)
CREATE POLICY "Allow all access to courses" ON courses FOR ALL USING (true);
CREATE POLICY "Allow all access to submissions" ON submissions FOR ALL USING (true);
CREATE POLICY "Allow all access to student_history" ON student_history FOR ALL USING (true);

*/

export default supabase;
