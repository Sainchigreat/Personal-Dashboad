import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setCsrf, setPreviewToken } from "./api";
import { todayInZone } from "./date";
import { browserStorage } from "./storage";
import { watchTheme } from "./theme";
import { invitationToken } from "./invite";
import type {
  AuthStatus,
  Cycle,
  Data,
  FormName,
  FormState,
  Page,
  Resource,
} from "../types";

const pages: Page[] = [
  "command",
  "day",
  "course",
  "studio",
  "chapter",
  "brand",
  "pipeline",
  "review",
  "team",
  "settings",
];
const pageFromHash = (): Page => {
  const page = location.hash.replace(/^#\/?/, "") as Page;
  return pages.includes(page) ? page : "command";
};
export type Context = {
  data: Data;
  cycle: Cycle;
  today: string;
  page: Page;
  setPage: (page: Page) => void;
  selectCycle: (id: string) => void;
  auth: AuthStatus;
  refresh: () => Promise<void>;
  create: (
    resource: Resource,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  update: (
    resource: Resource,
    id: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  remove: (resource: Resource, id: string) => Promise<void>;
  updateSettings: (data: Record<string, unknown>) => Promise<void>;
  rollover: (data: Record<string, unknown>) => Promise<void>;
  batchUpdate: (
    resource: Resource,
    records: Array<{ id: string; data: Record<string, unknown> }>,
  ) => Promise<void>;
  form: FormState | null;
  openForm: (
    name: FormName,
    record?: Record<string, unknown>,
    defaults?: Record<string, unknown>,
  ) => void;
  closeForm: () => void;
  toast: (message: string, kind?: "success" | "error") => void;
  signOut: () => Promise<void>;
  notice: { message: string; kind: "success" | "error" } | null;
};
const AppContext = createContext<Context | null>(null);
export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error("App context unavailable");
  return value;
};
export const asRecord = (item: unknown) => item as Record<string, unknown>;

export function AppProvider({
  children,
  authView,
  teamView,
}: {
  children: ReactNode;
  authView: (props: {
    status: AuthStatus;
    onAuthenticated: () => Promise<void>;
    onSignOut: () => Promise<void>;
  }) => ReactNode;
  teamView: (props: {
    auth: AuthStatus;
    signOut: () => Promise<void>;
    onThemeChanged: (theme: import("../types").ThemePreference) => void;
  }) => ReactNode;
}) {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [selectedId, setSelectedId] = useState(
    () => browserStorage.get("momentum-cycle") || "",
  );
  const [page, setPageState] = useState<Page>(pageFromHash);
  const [form, setForm] = useState<FormState | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    kind: "success" | "error";
  } | null>(null);
  const [fatal, setFatal] = useState("");

  const refresh = useCallback(async () => {
    const value = await api<Data>("/bootstrap");
    setData(value);
  }, []);
  const checkAuth = useCallback(async () => {
    const status = await api<AuthStatus>("/auth/status");
    if (
      !status.authenticated &&
      !invitationToken() &&
      status.previewEnabled &&
      browserStorage.get("momentum-preview-signed-out") !== "1"
    ) {
      const result = await api<{ csrfToken: string; previewToken: string }>(
        "/auth/preview",
        { method: "POST" },
      );
      setCsrf(result.csrfToken);
      setPreviewToken(result.previewToken);
      const updated = await api<AuthStatus>("/auth/status");
      setAuth(updated);
      await refresh();
      return;
    }
    setCsrf(status.csrfToken);
    setAuth(status);
    if (status.authenticated && status.accountType !== "team") await refresh();
    else setData(null);
  }, [refresh]);
  useEffect(() => {
    checkAuth().catch((error) =>
      setFatal(
        error instanceof Error ? error.message : "Unable to reach the server.",
      ),
    );
  }, [checkAuth]);
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(
    () => watchTheme(data?.settings.theme ?? auth?.theme ?? "system"),
    [data?.settings.theme, auth?.theme],
  );
  const setPage = useCallback((value: Page) => {
    location.hash = value;
    setPageState(value);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const selectCycle = useCallback((value: string) => {
    browserStorage.set("momentum-cycle", value);
    setSelectedId(value);
  }, []);
  const toast = useCallback(
    (message: string, kind: "success" | "error" = "success") =>
      setNotice({ message, kind }),
    [],
  );
  const create = useCallback(
    async (resource: Resource, body: Record<string, unknown>) => {
      const result = await api(`/${resource}`, { method: "POST", body });
      await refresh();
      return result;
    },
    [refresh],
  );
  const update = useCallback(
    async (
      resource: Resource,
      recordId: string,
      body: Record<string, unknown>,
    ) => {
      const result = await api(`/${resource}/${recordId}`, {
        method: "PATCH",
        body,
      });
      await refresh();
      return result;
    },
    [refresh],
  );
  const remove = useCallback(
    async (resource: Resource, recordId: string) => {
      await api(`/${resource}/${recordId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );
  const updateSettings = useCallback(
    async (body: Record<string, unknown>) => {
      await api("/settings", { method: "PATCH", body });
      await refresh();
    },
    [refresh],
  );
  const rollover = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await api<{ id: string }>("/cycles/rollover", {
        method: "POST",
        body,
      });
      await refresh();
      selectCycle(result.id);
    },
    [refresh, selectCycle],
  );
  const batchUpdate = useCallback(
    async (
      resource: Resource,
      records: Array<{ id: string; data: Record<string, unknown> }>,
    ) => {
      for (const record of records)
        await api(`/${resource}/${record.id}`, {
          method: "PATCH",
          body: record.data,
        });
      await refresh();
    },
    [refresh],
  );
  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      // A suspended or expired session is already signed out server-side.
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    setCsrf(null);
    setPreviewToken(null);
    browserStorage.set("momentum-preview-signed-out", "1");
    setData(null);
    await checkAuth();
  }, [checkAuth]);
  const openForm = useCallback(
    (
      name: FormName,
      record?: Record<string, unknown>,
      defaults?: Record<string, unknown>,
    ) => setForm({ name, record, defaults }),
    [],
  );
  const closeForm = useCallback(() => setForm(null), []);

  const cycle =
    data?.cycles.find((item) => item.id === selectedId) ||
    data?.cycles.find((item) => item.status === "active") ||
    data?.cycles[0];
  const value = useMemo(
    () =>
      data && auth && cycle
        ? {
            data,
            auth,
            cycle,
            today: todayInZone(data.settings.timezone),
            page,
            setPage,
            selectCycle,
            refresh,
            create,
            update,
            remove,
            updateSettings,
            rollover,
            batchUpdate,
            form,
            openForm,
            closeForm,
            toast,
            signOut,
            notice,
          }
        : null,
    [
      data,
      auth,
      cycle,
      page,
      setPage,
      selectCycle,
      refresh,
      create,
      update,
      remove,
      updateSettings,
      rollover,
      batchUpdate,
      form,
      openForm,
      closeForm,
      toast,
      signOut,
      notice,
    ],
  );

  if (fatal)
    return (
      <div className="boot-screen">
        <div className="boot-logo">M</div>
        <h1>Unable to open your workspace</h1>
        <p>{fatal}</p>
        <button
          className="button primary"
          onClick={() => {
            setFatal("");
            checkAuth().catch((error) => setFatal(error.message));
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!auth)
    return (
      <div className="boot-screen">
        <div className="boot-logo">M</div>
        <p>Opening your workspace…</p>
      </div>
    );
  const invitePending = Boolean(invitationToken());
  if (!auth.authenticated || invitePending)
    return (
      <>
        {authView({
          status: auth,
          onAuthenticated: checkAuth,
          onSignOut: signOut,
        })}
      </>
    );
  if (auth.accountType === "team")
    return (
      <>
        {teamView({
          auth,
          signOut,
          onThemeChanged: (theme) =>
            setAuth((old) => (old ? { ...old, theme } : old)),
        })}
      </>
    );
  if (!value)
    return (
      <div className="boot-screen">
        <div className="boot-logo">M</div>
        <p>Preparing your workspace…</p>
      </div>
    );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
