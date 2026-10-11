export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-lingo-gray mb-6" />
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border-2 border-lingo-border bg-white p-4 space-y-3"
          >
            <div className="h-5 w-40 animate-pulse rounded bg-lingo-gray" />
            <div className="h-4 w-64 animate-pulse rounded bg-lingo-gray" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-lingo-gray" />
          </div>
        ))}
      </div>
    </div>
  );
}
