import {
  cycleDefaultDate,
  displayMonth,
  nextMonth,
  weekdayNames,
} from "./date";
import type { Cycle, Data, FormName, Resource } from "../types";

type Option = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "month"
    | "time"
    | "number"
    | "select"
    | "checkbox"
    | "url";
  options?: Option[];
  placeholder?: string;
  required?: boolean;
  full?: boolean;
  help?: string;
  min?: number;
  max?: number;
};
type Definition = {
  title: string;
  editTitle?: string;
  description: string;
  resource?: Resource;
  fields: Field[];
  initial: Record<string, unknown>;
  submit?: string;
};
const opts = (items: string[]): Option[] =>
  items.map((item) => ({ value: item, label: item }));
const empty = { value: "", label: "None" };
const priorities = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
const taskStatuses = [
  { value: "todo", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "deferred", label: "Deferred" },
  { value: "cancelled", label: "Cancelled" },
];
const sources = [
  "WhatsApp",
  "Instagram",
  "LinkedIn",
  "YouTube",
  "Referral",
  "Webinar",
  "Email",
  "Other",
];
const categories = [
  "Personal",
  "Course Growth",
  "Creative Studio",
  "Next Chapter",
  "Personal Brand",
  "Client Pipeline",
];
const stages = [
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
];
const pillars = [
  "Brand identity & strategy",
  "Creative direction",
  "AI creative workflows",
  "Business of design",
  "Industry commentary",
  "Personal lessons",
  "Project breakdowns",
  "Future of creative work",
  "Next Chapter",
  "Course Growth",
];

export function getFormDefinition({
  data,
  cycle,
  today,
  record,
  name,
}: {
  data: Data;
  cycle: Cycle;
  today: string;
  record?: Record<string, unknown>;
  name: FormName;
}): Definition {
  const cycleOptions = [
    { value: "", label: "No cycle" },
    ...data.cycles
      .slice()
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((item) => ({ value: item.id, label: displayMonth(item.month) })),
  ];
  const productOptions = [
    { value: "", label: "Select product" },
    ...data.products
      .filter((item) => item.active || item.id === record?.product_id)
      .map((item) => ({ value: item.id, label: item.name })),
  ];
  const projectOptions = [
    empty,
    ...data.projects.map((item) => ({ value: item.id, label: item.title })),
  ];
  const sessionOptions = [
    empty,
    ...data.chapter_sessions.map((item) => ({
      value: item.id,
      label: item.title,
    })),
  ];
  const prospectOptions = [
    { value: "", label: "Select prospect" },
    ...data.prospects.map((item) => ({ value: item.id, label: item.company })),
  ];
  const cycleField: Field = {
    name: "cycle_id",
    label: "Operating cycle",
    type: "select",
    options: cycleOptions,
  };
  const defaultDate = cycleDefaultDate(cycle.month, today);
  const definitions: Record<FormName, Definition> = {
    task: {
      title: "Add a task",
      editTitle: "Edit task",
      description: "Give the important work a place in your day.",
      resource: "tasks",
      initial: {
        title: "",
        description: "",
        category: "Personal",
        priority: "medium",
        status: "todo",
        due_date: today,
        scheduled_time: "",
        estimated_minutes: 0,
        actual_minutes: 0,
        project_id: "",
        cycle_id: today.startsWith(cycle.month) ? cycle.id : "",
        notes: "",
      },
      fields: [
        {
          name: "title",
          label: "Task name",
          placeholder: "What needs your attention?",
          required: true,
          full: true,
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          placeholder: "Add a little context…",
          full: true,
        },
        {
          name: "category",
          label: "Area",
          type: "select",
          options: opts(categories),
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          options: priorities,
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: taskStatuses,
        },
        { name: "due_date", label: "Planned date", type: "date" },
        {
          name: "scheduled_time",
          label: "Timebox start",
          type: "time",
          help: "Optional; no time is assigned automatically.",
        },
        {
          name: "estimated_minutes",
          label: "Estimated minutes",
          type: "number",
          min: 0,
          max: 1440,
        },
        {
          name: "actual_minutes",
          label: "Actual minutes",
          type: "number",
          min: 0,
        },
        {
          name: "project_id",
          label: "Related project",
          type: "select",
          options: projectOptions,
        },
        cycleField,
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ],
    },
    sale: {
      title: "Log a sale",
      editTitle: "Edit sale",
      description: "Only confirmed paid transactions count toward revenue.",
      resource: "sales",
      initial: {
        cycle_id: cycle.id,
        product_id: data.products.find((item) => item.active)?.id || "",
        buyer: "",
        amount: data.products.find((item) => item.active)?.price || 0,
        sale_date: defaultDate,
        status: "pending",
        source: "WhatsApp",
        reference: "",
        notes: "",
      },
      fields: [
        { ...cycleField, required: true },
        {
          name: "product_id",
          label: "Product",
          type: "select",
          options: productOptions,
        },
        { name: "buyer", label: "Customer name", placeholder: "Optional" },
        {
          name: "amount",
          label: "Amount (₦)",
          type: "number",
          min: 0,
          required: true,
        },
        {
          name: "sale_date",
          label: "Transaction date",
          type: "date",
          required: true,
        },
        {
          name: "status",
          label: "Payment status",
          type: "select",
          options: [
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
            { value: "refunded", label: "Refunded" },
          ],
        },
        {
          name: "source",
          label: "Source",
          type: "select",
          options: opts(sources),
        },
        { name: "reference", label: "Payment reference" },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ],
    },
    lead: {
      title: "Add an enquiry",
      description:
        "Keep the conversation thoughtful and follow up at the right time.",
      resource: "leads",
      initial: {
        cycle_id: cycle.id,
        name: "",
        contact: "",
        source: "WhatsApp",
        status: "New",
        enquiry_date: today,
        follow_up_date: "",
        notes: "",
      },
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "contact", label: "Contact details" },
        {
          name: "source",
          label: "Source",
          type: "select",
          options: opts(sources),
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: opts([
            "New",
            "Replied",
            "Warm",
            "Follow-up due",
            "Converted",
            "Not interested",
          ]),
        },
        { name: "enquiry_date", label: "Enquiry date", type: "date" },
        { name: "follow_up_date", label: "Follow-up date", type: "date" },
        cycleField,
        {
          name: "notes",
          label: "Question, objection or notes",
          type: "textarea",
          full: true,
        },
      ],
    },
    campaign: {
      title: "Add a campaign",
      description: "Plan your promotion and record what actually happened.",
      resource: "campaigns",
      initial: {
        cycle_id: cycle.id,
        name: "",
        channel: "WhatsApp",
        status: "Planned",
        start_date: "",
        notes: "",
      },
      fields: [
        { name: "name", label: "Campaign name", required: true, full: true },
        {
          name: "channel",
          label: "Channel",
          type: "select",
          options: opts(sources),
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: opts(["Planned", "Active", "Completed", "Paused"]),
        },
        { name: "start_date", label: "Start date", type: "date" },
        cycleField,
        {
          name: "notes",
          label: "Notes / results",
          type: "textarea",
          full: true,
        },
      ],
    },
    promotion: {
      title: "Log a promotion",
      description:
        "Record a promotion you actually shared. Nothing is sent from Momentum OS.",
      resource: "promotions",
      initial: {
        cycle_id: today.startsWith(cycle.month) ? cycle.id : "",
        promotion_date: today,
        channel: "WhatsApp",
        notes: "",
      },
      fields: [
        {
          name: "promotion_date",
          label: "Date shared",
          type: "date",
          required: true,
        },
        {
          name: "channel",
          label: "Channel",
          type: "select",
          options: opts(sources),
        },
        cycleField,
        {
          name: "notes",
          label: "What did you share?",
          type: "textarea",
          full: true,
        },
      ],
    },
    prospect: {
      title: "Add a prospect",
      description: "Research and outreach are tracked separately.",
      resource: "prospects",
      initial: {
        company: "",
        contact: "",
        website: "",
        industry: "",
        business_type: "",
        opportunity: "",
        status: "Researching",
        researched_at: "",
        follow_up_date: "",
        deal_value: 0,
        notes: "",
      },
      fields: [
        { name: "company", label: "Business name", required: true },
        { name: "contact", label: "Contact person / details" },
        {
          name: "website",
          label: "Website or social link",
          type: "url",
          placeholder: "https://",
        },
        { name: "industry", label: "Industry" },
        { name: "business_type", label: "Business type" },
        {
          name: "status",
          label: "Pipeline status",
          type: "select",
          options: opts([
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
        },
        {
          name: "researched_at",
          label: "Date researched",
          type: "date",
          help: "Leave blank until research is complete.",
        },
        { name: "follow_up_date", label: "Follow-up date", type: "date" },
        {
          name: "deal_value",
          label: "Potential deal value (₦)",
          type: "number",
          min: 0,
        },
        {
          name: "opportunity",
          label: "Opportunity / outreach angle",
          type: "textarea",
          full: true,
        },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ],
    },
    interaction: {
      title: "Log an interaction",
      description:
        "Outreach and sent follow-ups count as outreach; research does not.",
      resource: "interactions",
      initial: {
        prospect_id: "",
        kind: "outreach",
        channel: "Email",
        occurred_date: today,
        summary: "",
      },
      fields: [
        {
          name: "prospect_id",
          label: "Prospect",
          type: "select",
          options: prospectOptions,
          required: true,
          full: true,
        },
        {
          name: "kind",
          label: "Activity",
          type: "select",
          options: [
            { value: "outreach", label: "Outreach sent" },
            { value: "reply", label: "Reply received" },
            { value: "call", label: "Call" },
            { value: "proposal", label: "Proposal sent" },
            { value: "follow-up", label: "Follow-up sent" },
            { value: "note", label: "Note" },
          ],
        },
        {
          name: "channel",
          label: "Channel",
          type: "select",
          options: opts([
            "Email",
            "Instagram",
            "LinkedIn",
            "WhatsApp",
            "Phone",
            "Other",
          ]),
        },
        { name: "occurred_date", label: "Date", type: "date", required: true },
        { name: "summary", label: "Summary", type: "textarea", full: true },
      ],
    },
    job: {
      title: "Add a job opportunity",
      description: "A separate space for applications and follow-ups.",
      resource: "jobs",
      initial: {
        company: "",
        role: "",
        url: "",
        applied_date: "",
        follow_up_date: "",
        status: "Interested",
        notes: "",
      },
      fields: [
        { name: "company", label: "Company", required: true },
        { name: "role", label: "Role", required: true },
        {
          name: "url",
          label: "Job link",
          type: "url",
          placeholder: "https://",
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: opts([
            "Interested",
            "Applied",
            "Interview",
            "Offer",
            "Closed",
          ]),
        },
        { name: "applied_date", label: "Date applied", type: "date" },
        { name: "follow_up_date", label: "Follow-up date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ],
    },
    project: {
      title: "Create a project",
      description: "Turn a creative brief into a useful body of work.",
      resource: "projects",
      initial: {
        cycle_id: cycle.id,
        title: "",
        type: "Campaign",
        brief: "",
        objective: "",
        deliverables: "",
        stage: "Brief",
        priority: "medium",
        start_date: "",
        deadline: "",
        reference_url: "",
        final_url: "",
        notes: "",
      },
      fields: [
        { name: "title", label: "Project title", required: true, full: true },
        {
          name: "type",
          label: "Project type",
          type: "select",
          options: opts([
            "Campaign",
            "Flyer",
            "Brand identity",
            "Product visual",
            "Experimental",
            "Other",
          ]),
        },
        {
          name: "stage",
          label: "Production stage",
          type: "select",
          options: opts(stages),
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          options: priorities,
        },
        cycleField,
        { name: "start_date", label: "Start date", type: "date" },
        { name: "deadline", label: "Deadline", type: "date" },
        { name: "brief", label: "Brief", type: "textarea", full: true },
        { name: "objective", label: "Objective", type: "textarea", full: true },
        {
          name: "deliverables",
          label: "Deliverables",
          type: "textarea",
          full: true,
        },
        {
          name: "reference_url",
          label: "Reference link",
          type: "url",
          placeholder: "https://",
        },
        {
          name: "final_url",
          label: "Final output link",
          type: "url",
          placeholder: "https://",
        },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ],
    },
    session: {
      title: "Plan a session",
      description:
        "A checklist and linked planning tasks will be created for this session.",
      resource: "chapter_sessions",
      initial: {
        cycle_id: cycle.id,
        title: "",
        central_question: "",
        guest: "",
        session_date: defaultDate,
        session_time: "",
        status: "Planning",
        youtube_url: "",
        recording_url: "",
        transcript: "",
        notes: "",
      },
      fields: [
        { name: "title", label: "Session topic", required: true, full: true },
        { name: "guest", label: "Guest" },
        {
          name: "status",
          label: "Session status",
          type: "select",
          options: opts([
            "Planning",
            "Guest Confirmed",
            "Announced",
            "Ready",
            "Live",
            "Completed",
            "Archived",
          ]),
        },
        {
          name: "session_date",
          label: "Session date",
          type: "date",
          required: true,
        },
        { name: "session_time", label: "Time", type: "time" },
        cycleField,
        {
          name: "youtube_url",
          label: "YouTube live link",
          type: "url",
          placeholder: "https://",
        },
        {
          name: "recording_url",
          label: "Recording link",
          type: "url",
          placeholder: "https://",
        },
        {
          name: "central_question",
          label: "Central question",
          type: "textarea",
          full: true,
        },
        {
          name: "transcript",
          label: "Transcript",
          type: "textarea",
          full: true,
        },
        {
          name: "notes",
          label: "Notes / audience questions",
          type: "textarea",
          full: true,
        },
      ],
    },
    content: {
      title: "Add a content idea",
      editTitle: "Edit content",
      description:
        "Plan it here; publishing always happens under your control.",
      resource: "content_items",
      initial: {
        cycle_id: cycle.id,
        project_id: "",
        session_id: "",
        title: "",
        pillar: "Creative direction",
        platform: "Instagram",
        format: "",
        status: "Idea",
        planned_date: "",
        published_date: "",
        body: "",
        asset_url: "",
        ai_assisted: 0,
        human_approved: 0,
      },
      fields: [
        { name: "title", label: "Content title", required: true, full: true },
        {
          name: "pillar",
          label: "Content pillar",
          type: "select",
          options: opts(pillars),
        },
        {
          name: "platform",
          label: "Platform",
          type: "select",
          options: opts([
            ...new Set([
              ...data.settings.platforms
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              ...(record?.platform ? [String(record.platform)] : []),
              "Other",
            ]),
          ]),
        },
        {
          name: "format",
          label: "Format",
          placeholder: "e.g. Carousel, article",
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: opts([
            "Idea",
            "Draft",
            "Review",
            "Approved",
            "Scheduled",
            "Published",
            "Distributed",
          ]),
        },
        { name: "planned_date", label: "Planned date", type: "date" },
        { name: "published_date", label: "Published date", type: "date" },
        {
          name: "project_id",
          label: "Related project",
          type: "select",
          options: projectOptions,
        },
        {
          name: "session_id",
          label: "Related session",
          type: "select",
          options: sessionOptions,
        },
        cycleField,
        {
          name: "asset_url",
          label: "Asset link",
          type: "url",
          placeholder: "https://",
        },
        {
          name: "body",
          label: "Caption, script or brief",
          type: "textarea",
          full: true,
        },
        {
          name: "ai_assisted",
          label: "This content used AI assistance",
          type: "checkbox",
          full: true,
        },
        {
          name: "human_approved",
          label: "I have reviewed and approved this content",
          type: "checkbox",
          full: true,
          help: "Required before marking AI-assisted or session content as published.",
        },
      ],
    },
    product: {
      title: "Add a product",
      description: "Products persist independently of your monthly cycles.",
      resource: "products",
      initial: { name: "", price: 0, description: "", active: 1 },
      fields: [
        { name: "name", label: "Product name", required: true, full: true },
        {
          name: "price",
          label: "Current price (₦)",
          type: "number",
          min: 0,
          required: true,
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          full: true,
        },
        {
          name: "active",
          label: "Available for new sales",
          type: "checkbox",
          full: true,
        },
      ],
    },
    cycle: {
      title: "Edit operating cycle",
      description:
        "Targets and rhythms are specific to this month; history is preserved.",
      resource: "cycles",
      initial: { ...cycle },
      fields: [
        { name: "theme", label: "Monthly theme", full: true },
        {
          name: "objective",
          label: "Primary objective",
          type: "textarea",
          full: true,
        },
        {
          name: "objectives",
          label: "Monthly objectives",
          type: "textarea",
          full: true,
          help: "One objective per line.",
        },
        {
          name: "sales_target",
          label: "Paid sales target",
          type: "number",
          min: 0,
        },
        {
          name: "revenue_target",
          label: "Revenue target (₦)",
          type: "number",
          min: 0,
        },
        {
          name: "outreach_target",
          label: "Daily outreach target",
          type: "number",
          min: 0,
        },
        {
          name: "projects_target",
          label: "Weekly creative target",
          type: "number",
          min: 0,
        },
        {
          name: "chapter_content_target",
          label: "Weekly Next Chapter content target",
          type: "number",
          min: 0,
        },
        {
          name: "course_days",
          label: "Course publishing days",
          placeholder: "2,3,5",
          help: "Use numbers separated by commas: Sunday 0 through Saturday 6.",
        },
        {
          name: "session_day",
          label: "Next Chapter session day",
          type: "select",
          options: weekdayNames.map((day, index) => ({
            value: String(index),
            label: day,
          })),
        },
      ],
    },
    rollover: {
      title: "Start a new cycle",
      description: "Your history stays intact. Choose what to carry forward.",
      initial: {
        month: nextMonth(cycle.month),
        theme: "",
        objective: "",
        objectives: "",
        sales_target: cycle.sales_target,
        revenue_target: cycle.revenue_target,
        outreach_target: cycle.outreach_target,
        projects_target: cycle.projects_target,
        chapter_content_target: cycle.chapter_content_target,
        course_days: cycle.course_days,
        session_day: cycle.session_day,
        carry_tasks: false,
      },
      submit: "Create cycle",
      fields: [
        {
          name: "month",
          label: "Operating month",
          type: "month",
          required: true,
        },
        {
          name: "theme",
          label: "Monthly theme",
          placeholder: "What will guide this month?",
        },
        {
          name: "objective",
          label: "Primary objective",
          type: "textarea",
          full: true,
        },
        {
          name: "objectives",
          label: "Monthly objectives",
          type: "textarea",
          full: true,
          help: "One objective per line.",
        },
        {
          name: "sales_target",
          label: "Paid sales target",
          type: "number",
          min: 0,
        },
        {
          name: "revenue_target",
          label: "Revenue target (₦)",
          type: "number",
          min: 0,
        },
        {
          name: "outreach_target",
          label: "Daily outreach target",
          type: "number",
          min: 0,
        },
        {
          name: "projects_target",
          label: "Weekly creative target",
          type: "number",
          min: 0,
        },
        {
          name: "chapter_content_target",
          label: "Weekly Next Chapter content target",
          type: "number",
          min: 0,
        },
        {
          name: "course_days",
          label: "Course publishing days",
          help: "Sunday 0 through Saturday 6, comma-separated.",
        },
        {
          name: "session_day",
          label: "Next Chapter session day",
          type: "select",
          options: weekdayNames.map((day, index) => ({
            value: String(index),
            label: day,
          })),
        },
        {
          name: "carry_tasks",
          label: `Carry unfinished tasks from ${displayMonth(cycle.month)}`,
          type: "checkbox",
          full: true,
          help: "Creates linked copies and marks the original tasks as carried. Projects, prospects, and content remain available.",
        },
      ],
    },
  };
  return definitions[name];
}
