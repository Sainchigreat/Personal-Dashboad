// Chisom Ogbonna's personal November operating plan.
//
// This file is DATA, never a global default. It is applied only to the verified
// personal owner (see isPersonalOwner() in server/db.ts). Every other account
// starts with a clean, private workspace and creates its own routine through
// onboarding. No other user inherits these goals, targets, tasks or schedule.
//
// Prospecting: research is performed by the separate prospect-research system,
// which delivers a daily prospect report. Chisom reviews that report, sends 20
// targeted proposals/outreach messages, logs them and follows up. There is no
// job-search task, no 5/6/8 AM batch and no "research 20 businesses" task here.

export type PlanTask = {
  title: string;
  category: string;
  priority: "high" | "medium" | "low";
  estimated_minutes: number;
  /** Weekly-goal outcome this deliverable contributes to, if any. */
  goalKey?: string;
};

export const PERSONAL_OWNER_ENV = "MOMENTUM_PERSONAL_OWNER_EMAIL";

/** Recurring daily responsibilities. Publishing is NOT here: it is day-specific. */
export const PERSONAL_ROUTINE: PlanTask[] = [
  {
    title: "Review the daily prospect report",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 20,
    goalKey: "client-outreach",
  },
  {
    title: "Send 20 targeted client proposals/outreach messages",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 60,
    goalKey: "client-outreach",
  },
  {
    title: "Log outreach actions and follow up responses",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 25,
    goalKey: "client-outreach",
  },
  {
    title: "Publish the day's Graphic Design with AI course promotion",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 20,
    goalKey: "course-promotion",
  },
  {
    title: "Respond to course enquiries and follow up warm leads",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 30,
    goalKey: "course-promotion",
  },
  {
    title: "Research and contact 3 promotional partners for Graphic Design with AI",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 30,
    goalKey: "course-partnerships",
  },
  {
    title: "Review relevant creative and AI industry developments",
    category: "Personal Brand",
    priority: "medium",
    estimated_minutes: 20,
    goalKey: "personal-brand",
  },
  {
    title: "Record today's wins, blockers and tomorrow's first action",
    category: "Personal",
    priority: "low",
    estimated_minutes: 10,
    goalKey: "weekly-review",
  },
];

/**
 * Fixed Monday–Sunday publishing calendar (November 2–8). Each day carries its
 * real assignment; there is deliberately no generic "publish something" task.
 */
export const PUBLISHING_CALENDAR: Record<number, string> = {
  1: "Publish Monday's selected post",
  2: "Publish Carousel 1",
  3: "Publish Brand Identity Project 1 and Creative Studio Project 1 campaign output",
  4: "Publish Carousel 2 and the YouTube tutorial",
  5: "Publish Next Chapter content",
  6: "Publish Brand Identity Project 2's second installment",
  0: "Publish Creative Studio Project 2 output",
};

/**
 * Weekday-specific scheduled work. Creative Studio and Brand Identity stay as
 * four distinct project tracks; they are never merged into a generic
 * "Creative Project 1" task. Team assignments appear only as Chisom's own
 * coordination work, never as another member's personal tasks.
 */
export const PERSONAL_WEEKDAY_PLAN: Record<number, PlanTask[]> = {
  1: [
    { title: "Review the week's priorities", category: "Personal", priority: "high", estimated_minutes: 20, goalKey: "weekly-review" },
    { title: "Publish Monday's selected post", category: "Personal Brand", priority: "high", estimated_minutes: 45, goalKey: "publishing" },
    { title: "Start Creative Studio Project 1 — social-media campaign (Monday–Wednesday)", category: "Creative Studio", priority: "high", estimated_minutes: 120, goalKey: "creative-studio" },
    { title: "Start Brand Identity Project 1", category: "Personal Brand", priority: "high", estimated_minutes: 90, goalKey: "brand-identity" },
    { title: "Begin the November content bank", category: "Personal Brand", priority: "high", estimated_minutes: 60, goalKey: "content-bank" },
    { title: "Prepare the Next Chapter announcement and session content", category: "Next Chapter", priority: "high", estimated_minutes: 40, goalKey: "next-chapter" },
    { title: "Hold the team strategy meeting and assign owners and deadlines", category: "Team Workspace", priority: "high", estimated_minutes: 45 },
    { title: "Brief the team on the Next Chapter main flyer, speaker-bio flyer and separate advertising flyer", category: "Next Chapter", priority: "high", estimated_minutes: 30, goalKey: "next-chapter" },
    { title: "Begin recruiting a Social Media Manager (the Community Manager role already exists)", category: "Team Workspace", priority: "medium", estimated_minutes: 30 },
  ],
  2: [
    { title: "Publish Carousel 1 and distribute it", category: "Personal Brand", priority: "high", estimated_minutes: 45, goalKey: "publishing" },
    { title: "Continue Creative Studio Project 1 — social-media campaign", category: "Creative Studio", priority: "high", estimated_minutes: 120, goalKey: "creative-studio" },
    { title: "Continue Brand Identity Project 1", category: "Personal Brand", priority: "high", estimated_minutes: 60, goalKey: "brand-identity" },
    { title: "Develop substantial Next Chapter content", category: "Next Chapter", priority: "medium", estimated_minutes: 60, goalKey: "next-chapter" },
  ],
  3: [
    { title: "Publish Brand Identity Project 1 reveal/content", category: "Personal Brand", priority: "high", estimated_minutes: 60, goalKey: "brand-identity" },
    { title: "Publish Creative Studio Project 1 campaign output", category: "Creative Studio", priority: "high", estimated_minutes: 45, goalKey: "creative-studio" },
    { title: "Complete Creative Studio Project 1 social-media campaign", category: "Creative Studio", priority: "high", estimated_minutes: 90, goalKey: "creative-studio" },
    { title: "Continue Next Chapter content for Friday's session", category: "Next Chapter", priority: "medium", estimated_minutes: 60, goalKey: "next-chapter" },
  ],
  4: [
    { title: "Publish Carousel 2", category: "Personal Brand", priority: "high", estimated_minutes: 45, goalKey: "publishing" },
    { title: "Publish the YouTube tutorial", category: "Personal Brand", priority: "high", estimated_minutes: 90, goalKey: "youtube" },
    { title: "Distribute the YouTube tutorial", category: "Personal Brand", priority: "medium", estimated_minutes: 30, goalKey: "youtube" },
    { title: "Start Creative Studio Project 2 — flyer project", category: "Creative Studio", priority: "high", estimated_minutes: 120, goalKey: "creative-studio" },
    { title: "Continue Next Chapter preparation", category: "Next Chapter", priority: "medium", estimated_minutes: 60, goalKey: "next-chapter" },
  ],
  5: [
    { title: "Publish Next Chapter content", category: "Next Chapter", priority: "high", estimated_minutes: 45, goalKey: "publishing" },
    { title: "Complete and host the weekly Next Chapter live session", category: "Next Chapter", priority: "high", estimated_minutes: 90, goalKey: "next-chapter" },
    { title: "Review speaker readiness and next session requirements", category: "Next Chapter", priority: "medium", estimated_minutes: 20, goalKey: "next-chapter" },
    { title: "Continue and complete Creative Studio Project 2 flyer", category: "Creative Studio", priority: "high", estimated_minutes: 90, goalKey: "creative-studio" },
  ],
  6: [
    { title: "Publish Brand Identity Project 2's second installment", category: "Personal Brand", priority: "high", estimated_minutes: 60, goalKey: "brand-identity" },
    { title: "Batch creative assets", category: "Creative Studio", priority: "medium", estimated_minutes: 90, goalKey: "creative-studio" },
    { title: "Prepare next week's content drafts", category: "Personal Brand", priority: "medium", estimated_minutes: 60, goalKey: "content-bank" },
  ],
  0: [
    { title: "Publish Creative Studio Project 2 output", category: "Creative Studio", priority: "high", estimated_minutes: 45, goalKey: "publishing" },
    { title: "Review weekly course sales against the 17-sale target", category: "Course Growth", priority: "high", estimated_minutes: 20, goalKey: "course-sales" },
    { title: "Review client outreach activity and responses", category: "Client Pipeline", priority: "high", estimated_minutes: 20, goalKey: "client-outreach" },
    { title: "Review all seven days of publishing", category: "Personal Brand", priority: "medium", estimated_minutes: 20, goalKey: "publishing" },
    { title: "Review Creative Studio Project 1 and Project 2", category: "Creative Studio", priority: "medium", estimated_minutes: 30, goalKey: "creative-studio" },
    { title: "Review the two brand identity projects", category: "Personal Brand", priority: "medium", estimated_minutes: 30, goalKey: "brand-identity" },
    { title: "Review the Next Chapter live session", category: "Next Chapter", priority: "medium", estimated_minutes: 20, goalKey: "next-chapter" },
    { title: "Write the weekly review: wins, lessons, blockers and unfinished work", category: "Personal", priority: "high", estimated_minutes: 40, goalKey: "weekly-review" },
    { title: "Review the week's personal and business performance", category: "Personal", priority: "medium", estimated_minutes: 30, goalKey: "weekly-review" },
    { title: "Plan the coming week and set next week's priorities", category: "Personal", priority: "high", estimated_minutes: 40, goalKey: "weekly-review" },
    { title: "Prepare the next week's publishing schedule", category: "Personal Brand", priority: "medium", estimated_minutes: 30, goalKey: "content-bank" },
    { title: "Start planning next Friday's Next Chapter session", category: "Next Chapter", priority: "medium", estimated_minutes: 30, goalKey: "next-chapter" },
  ],
};

export type GoalSeed = {
  key: string;
  title: string;
  outcome: string;
  target: number;
  unit: string;
  source: "manual" | "tasks" | "sales" | "revenue" | "publishing" | "outreach" | "projects";
  monthlyKey: string;
  notes: string;
};

/** Five monthly goals, scoped to Chisom only. */
export const PERSONAL_MONTHLY_GOALS = [
  {
    key: "course",
    title: "Graphic Design with AI course",
    description:
      "November revenue target ₦1,000,000 at the ₦14,900 launch price; ~68 purchases; 17 sales per week. Daily promotion, enquiry follow-up and promotional partner acquisition.",
    metric_type: "outcome",
    source: "sales",
    target: 68,
    unit: "paid seats",
    notes:
      "Revenue target ₦1,000,000 (rounded); 68 × ₦14,900 = ₦1,013,200 exact arithmetic. Weekly slice: 17 sales.",
  },
  {
    key: "next-chapter",
    title: "Next Chapter",
    description:
      "Weekly Friday live masterclass; build audience and brand awareness around creativity in the AI era; prepare speakers and creative assets; deliver each scheduled session.",
    metric_type: "project",
    source: "manual",
    target: 4,
    unit: "live sessions",
    notes: "Regular session day: Friday. Three creative deliverables: main flyer, speaker-bio flyer, separate advertising flyer.",
  },
  {
    key: "cartridge",
    title: "Cartridge",
    description:
      "Core November initiative. Activities come from the existing project notes and workspace; no recurring activities are invented here.",
    metric_type: "project",
    source: "manual",
    target: 1,
    unit: "initiative",
    notes: "Reconciled from existing project notes; no invented recurring routine.",
  },
  {
    key: "personal-brand",
    title: "Personal brand and creative development",
    description:
      "Publish every day, build the monthly content bank, create and publish design projects, build authority around design/creativity/AI and continue industry learning.",
    metric_type: "behaviour",
    source: "publishing",
    target: 30,
    unit: "published days",
    notes: "Publishing progress is derived from content records with real publication dates.",
  },
  {
    key: "client-acquisition",
    title: "Client acquisition",
    description:
      "Review system-generated prospect reports, send 20 targeted outreach/proposal messages daily, maintain follow-up records and convert conversations into opportunities.",
    metric_type: "behaviour",
    source: "outreach",
    target: 20,
    unit: "outreach actions per day",
    notes: "Research is delivered by the separate prospect-research system; Chisom reviews the report and acts on it.",
  },
] as const;

/** November 2–8 weekly outcomes linked to the monthly goals above. */
export const PERSONAL_WEEKLY_GOALS: GoalSeed[] = [
  { key: "course-sales", title: "Sell Graphic Design with AI", outcome: "Sell Graphic Design with AI", target: 17, unit: "paid buyers", source: "sales", monthlyKey: "course", notes: "Weekly pace toward the 68-seat November target. Paid sales only; pending/refunded excluded." },
  { key: "course-promotion", title: "Daily course promotion and lead follow-up", outcome: "Daily course promotion and lead follow-up", target: 7, unit: "days", source: "tasks", monthlyKey: "course", notes: "Daily promotion plus enquiry/warm-lead follow-up; counted from linked completed tasks." },
  { key: "course-partnerships", title: "Three course promotional partners daily", outcome: "Three course promotional partners daily", target: 3, unit: "partners per day", source: "tasks", monthlyKey: "course", notes: "Graphic Design with AI promotional partners, NOT Next Chapter speakers." },
  { key: "client-outreach", title: "20 client outreach/proposal actions daily", outcome: "20 client outreach/proposal actions daily", target: 20, unit: "actions per day", source: "tasks", monthlyKey: "client-acquisition", notes: "Review the system-generated prospect report, send 20 targeted messages, log outreach and follow-ups." },
  { key: "publishing", title: "Publish every day", outcome: "Publish every day", target: 7, unit: "days", source: "publishing", monthlyKey: "personal-brand", notes: "Monday–Sunday publishing calendar; derived from published content records." },
  { key: "content-bank", title: "Build the November content bank", outcome: "Build the November content bank", target: 1, unit: "content bank", source: "tasks", monthlyKey: "personal-brand", notes: "Monthly ideas, drafts and publishing plan." },
  { key: "next-chapter", title: "Prepare and deliver Friday's Next Chapter live session", outcome: "Prepare and deliver Friday's Next Chapter live session", target: 1, unit: "live session", source: "tasks", monthlyKey: "next-chapter", notes: "Includes speaker readiness and the three flyer deliverables." },
  { key: "youtube", title: "Publish the YouTube tutorial by Thursday", outcome: "Publish the YouTube tutorial by Thursday", target: 1, unit: "video", source: "publishing", monthlyKey: "personal-brand", notes: "Publish and distribute by Thursday." },
  { key: "creative-studio", title: "Complete two Creative Studio projects", outcome: "Complete two Creative Studio projects", target: 2, unit: "projects", source: "projects", monthlyKey: "personal-brand", notes: "Project 1 social-media campaign (Mon–Wed), Project 2 flyer (Thu–Sun)." },
  { key: "brand-identity", title: "Advance two brand identity projects", outcome: "Advance two brand identity projects", target: 2, unit: "projects", source: "tasks", monthlyKey: "personal-brand", notes: "Distinct from the two Creative Studio projects." },
  { key: "weekly-review", title: "Complete the Sunday review and next-week plan", outcome: "Complete the Sunday review and next-week plan", target: 1, unit: "review", source: "tasks", monthlyKey: "personal-brand", notes: "Wins, lessons, blockers, unfinished work, performance review, next-week priorities and publishing schedule." },
];

/** Obsolete titles that must never appear in an active recurring plan. */
export const OBSOLETE_TITLES = [
  "Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets",
  "Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners",
  "Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets",
  "Research 10 new/emerging businesses and 10 established businesses",
  "Publish one useful piece of content today on Instagram and/or WhatsApp",
  "Send 20 relevant client outreach messages/proposals and log each interaction",
  "Promote Graphic Design with AI; respond to enquiries and follow up warm leads",
  "Capture one useful AI, design or creative-industry development",
  "Complete and log 20 targeted client outreach actions",
  "Creative Project 1 — complete today's planned milestone",
  "Creative Project 2 — complete today's planned milestone",
];

export const JOB_BATCH_TITLES = OBSOLETE_TITLES.slice(0, 3);
