export type Page =
  | "command"
  | "day"
  | "course"
  | "studio"
  | "chapter"
  | "brand"
  | "pipeline"
  | "review"
  | "goals"
  | "speakers"
  | "team"
  | "cloud"
  | "settings";
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
  onboarding_completed: number;
  onboarding_profile: string;
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
  weekly_goal_id: string | null;
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
/** Monthly -> Weekly -> Daily goal hierarchy (additive schema). */
export interface MonthlyGoal extends Base {
  workspace_id: string;
  title: string;
  description: string;
  category: string;
  metric_type: "outcome" | "project" | "behaviour";
  source:
    | "manual"
    | "tasks"
    | "sales"
    | "revenue"
    | "publishing"
    | "outreach"
    | "projects";
  target: number;
  unit: string;
  baseline: number;
  status: "active" | "archived" | "completed";
  start_date: string | null;
  end_date: string | null;
  notes: string;
}
export interface WeeklyGoal extends Base {
  workspace_id: string;
  monthly_goal_id: string | null;
  cycle_id: string | null;
  week_start: string;
  week_end: string;
  outcome: string;
  target: number;
  unit: string;
  current: number;
  source:
    | "manual"
    | "tasks"
    | "sales"
    | "revenue"
    | "publishing"
    | "outreach"
    | "projects";
  owner_id: string | null;
  assignee_id: string | null;
  priority: "high" | "medium" | "low";
  status: "active" | "archived" | "completed" | "carried";
  visibility: "private" | "team";
  notes: string;
}
export interface GoalLink {
  weekly_goal_id: string;
  monthly_goal_id: string;
}
export interface Speaker extends Base {
  workspace_id: string;
  session_id: string | null;
  name: string;
  email: string;
  phone: string;
  organisation: string;
  biography: string;
  topic: string;
  invitation_status:
    | "not_invited"
    | "invited"
    | "awaiting_response"
    | "confirmed"
    | "declined"
    | "completed";
  confirmation_status: "pending" | "confirmed" | "declined";
  agreed_date: string | null;
  alternative_dates: string;
  reminder_dates: string;
  reminder_status: "not_sent" | "scheduled" | "sent" | "acknowledged";
  asset_requirements: string;
  asset_approval_status: "pending" | "in_review" | "approved" | "changes_requested";
  bio_photo_received: number;
  flyer_approved: number;
  owner_id: string | null;
  notes: string;
}
export interface SpeakerFollowup extends Base {
  speaker_id: string;
  occurred_date: string;
  channel: string;
  summary: string;
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
  monthly_goals: MonthlyGoal[];
  weekly_goals: WeeklyGoal[];
  goal_links: GoalLink[];
  speakers: Speaker[];
  speaker_followups: SpeakerFollowup[];
}
export type Resource = Exclude<keyof Data, "settings">;
export interface AuthStatus {
  authenticated: boolean;
  needsSetup: boolean;
  previewEnabled: boolean;
  csrfToken: string | null;
  email: string | null;
  accountType?: "owner" | "team" | null;
  theme?: ThemePreference | null;
  browserDemo?: boolean;
}
export interface FormState {
  name: FormName;
  record?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
}
