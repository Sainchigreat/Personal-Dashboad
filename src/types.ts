export type Page =
  | "command"
  | "day"
  | "course"
  | "studio"
  | "chapter"
  | "brand"
  | "pipeline"
  | "review"
  | "settings"
  | "team";
export type FormName =
  | "task"
  | "sale"
  | "lead"
  | "campaign"
  | "promotion"
  | "prospect"
  | "interaction"
  | "job"
  | "project"
  | "session"
  | "content"
  | "product"
  | "cycle"
  | "rollover";
export interface Base {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}
export type ThemePreference = "system" | "dark" | "light";

export interface Settings extends Base {
  name: string;
  business_name: string;
  timezone: string;
  work_start: string;
  work_end: string;
  theme: ThemePreference;
  platforms: string;
  notifications_enabled: number;
  auto_plan: number;
  daily_templates: string;
}
export interface Cycle extends Base {
  month: string;
  theme: string;
  objective: string;
  objectives: string;
  sales_target: number;
  revenue_target: number;
  outreach_target: number;
  projects_target: number;
  chapter_content_target: number;
  course_days: string;
  session_day: number;
  status: "active" | "archived";
}
export interface Product extends Base {
  name: string;
  price: number;
  description: string;
  active: number;
}
export interface Task extends Base {
  cycle_id: string | null;
  project_id: string | null;
  session_id: string | null;
  carried_from_id: string | null;
  title: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  status:
    "todo" | "in_progress" | "done" | "deferred" | "cancelled" | "carried";
  due_date: string | null;
  scheduled_time: string;
  estimated_minutes: number;
  actual_minutes: number;
  sort_order: number;
  notes: string;
  completed_at: string | null;
}
export interface Sale extends Base {
  cycle_id: string | null;
  product_id: string | null;
  buyer: string;
  amount: number;
  sale_date: string;
  status: "pending" | "paid" | "refunded";
  source: string;
  reference: string;
  notes: string;
}
export interface Lead extends Base {
  cycle_id: string | null;
  name: string;
  contact: string;
  source: string;
  status: string;
  enquiry_date: string | null;
  follow_up_date: string | null;
  notes: string;
}
export interface Campaign extends Base {
  cycle_id: string | null;
  name: string;
  channel: string;
  status: string;
  start_date: string | null;
  notes: string;
}
export interface Promotion extends Base {
  cycle_id: string | null;
  promotion_date: string;
  channel: string;
  notes: string;
}
export interface Prospect extends Base {
  company: string;
  contact: string;
  website: string;
  industry: string;
  business_type: string;
  opportunity: string;
  status: string;
  researched_at: string | null;
  follow_up_date: string | null;
  deal_value: number;
  notes: string;
}
export interface Interaction extends Base {
  prospect_id: string;
  kind: string;
  channel: string;
  occurred_date: string;
  summary: string;
}
export interface Job extends Base {
  company: string;
  role: string;
  url: string;
  applied_date: string | null;
  follow_up_date: string | null;
  status: string;
  notes: string;
}
export interface Project extends Base {
  cycle_id: string | null;
  title: string;
  type: string;
  brief: string;
  objective: string;
  deliverables: string;
  stage: string;
  priority: string;
  start_date: string | null;
  deadline: string | null;
  reference_url: string;
  final_url: string;
  notes: string;
  completed_at: string | null;
}
export interface ChapterSession extends Base {
  cycle_id: string | null;
  title: string;
  central_question: string;
  guest: string;
  session_date: string;
  session_time: string;
  status: string;
  youtube_url: string;
  recording_url: string;
  transcript: string;
  notes: string;
}
export interface Checklist extends Base {
  session_id: string;
  title: string;
  done: number;
  sort_order: number;
}
export interface ContentItem extends Base {
  cycle_id: string | null;
  project_id: string | null;
  session_id: string | null;
  title: string;
  pillar: string;
  platform: string;
  format: string;
  status: string;
  planned_date: string | null;
  published_date: string | null;
  body: string;
  asset_url: string;
  ai_assisted: number;
  human_approved: number;
}
export interface DailyNote extends Base {
  day: string;
  wins: string;
  blockers: string;
  lessons: string;
  tomorrow: string;
}
export interface WeeklyReview extends Base {
  week_start: string;
  wins: string;
  blockers: string;
  lessons: string;
  priorities: string;
}
export interface Data {
  settings: Settings;
  cycles: Cycle[];
  products: Product[];
  tasks: Task[];
  sales: Sale[];
  leads: Lead[];
  campaigns: Campaign[];
  promotions: Promotion[];
  prospects: Prospect[];
  interactions: Interaction[];
  jobs: Job[];
  projects: Project[];
  chapter_sessions: ChapterSession[];
  session_checklists: Checklist[];
  content_items: ContentItem[];
  daily_notes: DailyNote[];
  weekly_reviews: WeeklyReview[];
}
export type Resource = Exclude<keyof Data, "settings">;
export interface AuthStatus {
  authenticated: boolean;
  needsSetup: boolean;
  previewEnabled: boolean;
  csrfToken: string | null;
  email: string | null;
}
export interface FormState {
  name: FormName;
  record?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
}
