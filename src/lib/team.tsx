import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import type { ThemePreference } from "../types";

export type TeamRole = "owner" | "manager" | "member";
export interface TeamMember {
  user_id: string;
  name: string;
  email: string | null;
  role: TeamRole;
  status: "active" | "suspended";
  joined_at: string;
}
export interface TeamGoal {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  due_date: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
}
export type TeamTaskStatus =
  | "assigned"
  | "in_progress"
  | "submitted"
  | "revision_requested"
  | "approved"
  | "completed";
export interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee_user_id: string;
  assignee_name: string;
  reviewer_user_id: string | null;
  reviewer_name: string | null;
  goal_id: string | null;
  goal_title: string | null;
  priority: "low" | "medium" | "high";
  status: TeamTaskStatus;
  due_date: string | null;
  deliverable: string;
  submission: string;
  feedback: string;
}
export interface TeamComment {
  id: string;
  task_id: string;
  user_id: string;
  name: string;
  body: string;
  created_at: string;
}
export interface TeamEvent {
  id: string;
  summary: string;
  name: string;
  created_at: string;
}
export interface TeamInvite {
  id: string;
  email: string;
  role: "manager" | "member";
  expires_at: number;
}
export interface TeamData {
  workspace: { id: string; name: string };
  membership: {
    workspace_id: string;
    user_id: string;
    role: TeamRole;
    status: string;
  };
  goals: TeamGoal[];
  tasks: TeamTask[];
  members: TeamMember[];
  comments: TeamComment[];
  activity: TeamEvent[];
  invites: TeamInvite[];
  preferences: { theme: ThemePreference };
}
type Context = {
  data: TeamData | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
};
const TeamContext = createContext<Context | null>(null);
export function TeamProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const newestRequest = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++newestRequest.current;
    try {
      const value = await api<TeamData>("/team/bootstrap");
      if (request === newestRequest.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (request === newestRequest.current) {
        if (e instanceof ApiError && [401, 403].includes(e.status))
          setData(null);
        setError(
          e instanceof Error ? e.message : "Unable to load team workspace.",
        );
      }
      throw e;
    } finally {
      if (request === newestRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    void refresh().catch(() => {});
    window.addEventListener("focus", updateWhenVisible);
    document.addEventListener("visibilitychange", updateWhenVisible);
    const timer = window.setInterval(updateWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", updateWhenVisible);
      document.removeEventListener("visibilitychange", updateWhenVisible);
      window.clearInterval(timer);
      newestRequest.current++;
    };
  }, [refresh]);
  const value = useMemo(
    () => ({ data, error, loading, refresh }),
    [data, error, loading, refresh],
  );
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}
export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error("Team context unavailable");
  return context;
}
