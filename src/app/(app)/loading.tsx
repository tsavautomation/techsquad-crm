// Shown the moment a tab or page is clicked, while the server builds the new page (Fred 2026-10-20:
// tab switches felt slow because nothing moved until the whole page arrived). Also lets Next.js
// pre-load the route when a link is hovered.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-4 h-7 w-48 rounded-lg bg-muted" />
      <div className="mb-3 flex gap-2">
        <div className="h-9 w-40 rounded-lg bg-muted" />
        <div className="h-9 w-24 rounded-lg bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 rounded-2xl border bg-card shadow-card" />
        ))}
      </div>
    </div>
  );
}
