export default function TeamWorkspace() {
  return (
    <section className="team-workspace-page" aria-label="Team Workspace">
      <iframe
        title="Momentum OS Team Workspace"
        src="/team-workspace-preview.html"
        style={{
          display: "block",
          width: "100%",
          minHeight: "calc(100vh - 112px)",
          border: 0,
          borderRadius: 16,
          background: "#090e19",
        }}
      />
    </section>
  );
}
