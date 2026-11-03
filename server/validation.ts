import { z } from "zod";

const short = z.string().trim().max(240);
const long = z.string().trim().max(20000);
const link = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Enter a valid http or https URL.");
const dateValue = z
  .string()
  .refine((value) => {
    if (value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.")
  .nullable();
const optionalId = z.string().uuid().or(z.literal("")).nullable();
const time = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/, "Enter a valid time.");
const nonnegative = z.number().finite().min(0).max(1_000_000_000);
const whole = nonnegative.int();
const flag = z.number().int().min(0).max(1);
const cycle = optionalId;
const resource = (fields: z.ZodRawShape, required: string[] = []) => ({
  schema: z.object(fields).strict().partial(),
  required,
});

export const configs = {
  cycles: resource(
    {
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      theme: short,
      objective: long,
      objectives: long,
      sales_target: whole,
      revenue_target: nonnegative,
      outreach_target: whole,
      projects_target: whole,
      chapter_content_target: whole,
      course_days: z.string().regex(/^(?:[0-6](?:,[0-6])*)?$/),
      session_day: z.number().int().min(0).max(6),
      status: z.enum(["active", "archived"]),
    },
    ["month"],
  ),
  products: resource(
    { name: short, price: nonnegative, description: long, active: flag },
    ["name"],
  ),
  tasks: resource(
    {
      cycle_id: cycle,
      project_id: optionalId,
      session_id: optionalId,
      weekly_goal_id: optionalId,
      title: short,
      description: long,
      category: short,
      priority: z.enum(["high", "medium", "low"]),
      status: z.enum([
        "todo",
        "in_progress",
        "done",
        "deferred",
        "cancelled",
        "carried",
      ]),
      due_date: dateValue,
      scheduled_time: time,
      estimated_minutes: whole.max(1440),
      actual_minutes: whole.max(1000000),
      sort_order: z.number().int().min(-100000).max(100000),
      notes: long,
    },
    ["title"],
  ),
  sales: resource(
    {
      cycle_id: cycle,
      product_id: optionalId,
      buyer: short,
      amount: nonnegative,
      sale_date: dateValue,
      status: z.enum(["pending", "paid", "refunded"]),
      source: short,
      reference: short,
      notes: long,
    },
    ["sale_date"],
  ),
  leads: resource(
    {
      cycle_id: cycle,
      name: short,
      contact: short,
      source: short,
      status: z.enum([
        "New",
        "Replied",
        "Warm",
        "Follow-up due",
        "Converted",
        "Not interested",
      ]),
      enquiry_date: dateValue,
      follow_up_date: dateValue,
      notes: long,
    },
    ["name"],
  ),
  campaigns: resource(
    {
      cycle_id: cycle,
      name: short,
      channel: short,
      status: z.enum(["Planned", "Active", "Completed", "Paused"]),
      start_date: dateValue,
      notes: long,
    },
    ["name"],
  ),
  promotions: resource(
    { cycle_id: cycle, promotion_date: dateValue, channel: short, notes: long },
    ["promotion_date"],
  ),
  prospects: resource(
    {
      company: short,
      contact: short,
      website: link,
      industry: short,
      business_type: short,
      opportunity: long,
      status: z.enum([
        "Researching",
        "Researched",
        "Ready to contact",
        "Contacted",
        "Replied",
        "Call booked",
        "Proposal sent",
        "Won",
        "Lost",
        "Not a fit",
      ]),
      researched_at: dateValue,
      follow_up_date: dateValue,
      deal_value: nonnegative,
      notes: long,
    },
    ["company"],
  ),
  interactions: resource(
    {
      prospect_id: optionalId,
      kind: z.enum([
        "outreach",
        "reply",
        "call",
        "proposal",
        "follow-up",
        "note",
      ]),
      channel: short,
      occurred_date: dateValue,
      summary: long,
    },
    ["prospect_id", "occurred_date"],
  ),
  jobs: resource(
    {
      company: short,
      role: short,
      url: link,
      applied_date: dateValue,
      follow_up_date: dateValue,
      status: z.enum(["Interested", "Applied", "Interview", "Offer", "Closed"]),
      notes: long,
    },
    ["company", "role"],
  ),
  projects: resource(
    {
      cycle_id: cycle,
      title: short,
      type: short,
      brief: long,
      objective: long,
      deliverables: long,
      stage: z.enum([
        "Brief",
        "Research & References",
        "Creative Direction",
        "Concept Development",
        "AI Production",
        "Design Execution",
        "Refinement",
        "Review",
        "Final Output",
        "Content Extraction",
        "Completed",
      ]),
      priority: z.enum(["high", "medium", "low"]),
      start_date: dateValue,
      deadline: dateValue,
      reference_url: link,
      final_url: link,
      notes: long,
    },
    ["title"],
  ),
  chapter_sessions: resource(
    {
      cycle_id: cycle,
      title: short,
      central_question: long,
      guest: short,
      session_date: dateValue,
      session_time: time,
      status: z.enum([
        "Planning",
        "Guest Confirmed",
        "Announced",
        "Ready",
        "Live",
        "Completed",
        "Archived",
      ]),
      youtube_url: link,
      recording_url: link,
      transcript: long,
      notes: long,
    },
    ["title", "session_date"],
  ),
  session_checklists: resource(
    {
      session_id: optionalId,
      title: short,
      done: flag,
      sort_order: z.number().int().min(0).max(10000),
    },
    ["session_id", "title"],
  ),
  content_items: resource(
    {
      cycle_id: cycle,
      project_id: optionalId,
      session_id: optionalId,
      title: short,
      pillar: short,
      platform: short,
      format: short,
      status: z.enum([
        "Idea",
        "Draft",
        "Review",
        "Approved",
        "Scheduled",
        "Published",
        "Distributed",
      ]),
      planned_date: dateValue,
      published_date: dateValue,
      body: long,
      asset_url: link,
      ai_assisted: flag,
      human_approved: flag,
    },
    ["title"],
  ),
  daily_notes: resource(
    {
      day: dateValue,
      wins: long,
      blockers: long,
      lessons: long,
      tomorrow: long,
    },
    ["day"],
  ),
  weekly_reviews: resource(
    {
      week_start: dateValue,
      wins: long,
      blockers: long,
      lessons: long,
      priorities: long,
    },
    ["week_start"],
  ),
  // Goal hierarchy. The generic /api/:resource routes scope every read and
  // write by user_id, so these records are private to their owner by default.
  monthly_goals: resource(
    {
      workspace_id: short,
      title: short,
      description: long,
      category: short,
      metric_type: z.enum(["outcome", "project", "behaviour"]),
      source: z.enum([
        "manual",
        "tasks",
        "sales",
        "revenue",
        "publishing",
        "outreach",
        "projects",
      ]),
      target: nonnegative,
      unit: short,
      baseline: nonnegative,
      status: z.enum(["active", "archived", "completed"]),
      start_date: dateValue,
      end_date: dateValue,
      notes: long,
    },
    ["title"],
  ),
  weekly_goals: resource(
    {
      workspace_id: short,
      monthly_goal_id: optionalId,
      cycle_id: optionalId,
      week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      outcome: short,
      target: nonnegative,
      unit: short,
      current: nonnegative,
      source: z.enum([
        "manual",
        "tasks",
        "sales",
        "revenue",
        "publishing",
        "outreach",
        "projects",
      ]),
      owner_id: optionalId,
      assignee_id: optionalId,
      priority: z.enum(["high", "medium", "low"]),
      status: z.enum(["active", "archived", "completed", "carried"]),
      visibility: z.enum(["private", "team"]),
      notes: long,
    },
    ["week_start", "week_end", "outcome"],
  ),
  goal_links: resource(
    {
      weekly_goal_id: z.string().uuid(),
      monthly_goal_id: z.string().uuid(),
    },
    ["weekly_goal_id", "monthly_goal_id"],
  ),
  speakers: resource(
    {
      workspace_id: short,
      session_id: optionalId,
      name: short,
      email: z.string().trim().max(254),
      phone: short,
      organisation: short,
      biography: long,
      topic: short,
      invitation_status: z.enum([
        "not_invited",
        "invited",
        "awaiting_response",
        "confirmed",
        "declined",
        "completed",
      ]),
      confirmation_status: z.enum(["pending", "confirmed", "declined"]),
      agreed_date: dateValue,
      alternative_dates: long,
      reminder_dates: long,
      asset_requirements: long,
      bio_photo_received: flag,
      flyer_approved: flag,
      owner_id: optionalId,
      notes: long,
    },
    ["name"],
  ),
  speaker_followups: resource(
    {
      speaker_id: z.string().uuid(),
      occurred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      channel: short,
      summary: long,
    },
    ["speaker_id", "occurred_date"],
  ),
} as const;

export const settingsSchema = z
  .object({
    name: short.min(1),
    business_name: short,
    timezone: short.refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid IANA time zone."),
    work_start: time.refine(Boolean, "Start time is required."),
    work_end: time.refine(Boolean, "End time is required."),
    theme: z.enum(["system", "dark", "light"]),
    platforms: z
      .string()
      .max(1000)
      .refine(
        (value) =>
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean).length > 0,
        "Add at least one platform.",
      ),
    notifications_enabled: flag,
    onboarding_completed: flag,
    onboarding_profile: z.string().trim().max(4000),
    auto_plan: flag,
    daily_templates: z
      .string()
      .max(20000)
      .refine((value) => {
        try {
          const items = JSON.parse(value);
          return (
            Array.isArray(items) &&
            items.length <= 30 &&
            items.every(
              (item) =>
                typeof item.title === "string" &&
                item.title.trim().length > 0 &&
                item.title.length <= 200 &&
                (item.estimated_minutes === undefined ||
                  (Number.isInteger(item.estimated_minutes) &&
                    item.estimated_minutes >= 0 &&
                    item.estimated_minutes <= 1440)),
            )
          );
        } catch {
          return false;
        }
      }, "Daily templates must be a valid list of tasks."),
  })
  .strict()
  .partial();

export type Resource = keyof typeof configs;
export const foreignKeys: Record<string, string> = {
  cycle_id: "cycles",
  product_id: "products",
  project_id: "projects",
  session_id: "chapter_sessions",
  prospect_id: "prospects",
  weekly_goal_id: "weekly_goals",
  monthly_goal_id: "monthly_goals",
  speaker_id: "speakers",
};
