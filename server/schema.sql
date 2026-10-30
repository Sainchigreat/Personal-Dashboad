PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Chisom Ogbonna',
  business_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  work_start TEXT NOT NULL DEFAULT '08:00',
  work_end TEXT NOT NULL DEFAULT '17:00',
  theme TEXT NOT NULL DEFAULT 'dark',
  platforms TEXT NOT NULL DEFAULT 'Instagram,LinkedIn,YouTube,WhatsApp',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  auto_plan INTEGER NOT NULL DEFAULT 1,
  daily_templates TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  sales_target INTEGER NOT NULL DEFAULT 0,
  revenue_target REAL NOT NULL DEFAULT 0,
  outreach_target INTEGER NOT NULL DEFAULT 0,
  projects_target INTEGER NOT NULL DEFAULT 0,
  chapter_content_target INTEGER NOT NULL DEFAULT 0,
  course_days TEXT NOT NULL DEFAULT '2,3,5',
  session_day INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, month)
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Campaign',
  brief TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'Brief',
  priority TEXT NOT NULL DEFAULT 'medium',
  start_date TEXT,
  deadline TEXT,
  reference_url TEXT NOT NULL DEFAULT '',
  final_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chapter_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  central_question TEXT NOT NULL DEFAULT '',
  guest TEXT NOT NULL DEFAULT '',
  session_date TEXT NOT NULL,
  session_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Planning',
  youtube_url TEXT NOT NULL DEFAULT '',
  recording_url TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  carried_from_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Personal',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  due_date TEXT,
  scheduled_time TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS generated_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY(user_id, day)
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  buyer TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  sale_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'Other',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL DEFAULT 'New',
  enquiry_date TEXT,
  follow_up_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WhatsApp',
  status TEXT NOT NULL DEFAULT 'Planned',
  start_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  promotion_date TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WhatsApp',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT '',
  opportunity TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Researching',
  researched_at TEXT,
  follow_up_date TEXT,
  deal_value REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'outreach',
  channel TEXT NOT NULL DEFAULT 'Email',
  occurred_date TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  applied_date TEXT,
  follow_up_date TEXT,
  status TEXT NOT NULL DEFAULT 'Interested',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL DEFAULT 'Creative direction',
  platform TEXT NOT NULL DEFAULT 'Instagram',
  format TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Idea',
  planned_date TEXT,
  published_date TEXT,
  body TEXT NOT NULL DEFAULT '',
  asset_url TEXT NOT NULL DEFAULT '',
  ai_assisted INTEGER NOT NULL DEFAULT 0,
  human_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_checklists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES chapter_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  wins TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  lessons TEXT NOT NULL DEFAULT '',
  tomorrow TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, day)
);
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  wins TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  lessons TEXT NOT NULL DEFAULT '',
  priorities TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_sales_user_cycle ON sales(user_id, cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_interactions_user_date ON interactions(user_id, occurred_date);
CREATE INDEX IF NOT EXISTS idx_content_user_date ON content_items(user_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON chapter_sessions(user_id, session_date);
