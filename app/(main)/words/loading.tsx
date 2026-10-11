export default function WordsLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-lingo-gray mb-2" />
        <div className="flex gap-2">
          <div className="h-6 w-16 animate-pulse rounded-full bg-lingo-gray" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-lingo-gray" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-lingo-gray" />
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <div className="h-10 w-28 animate-pulse rounded-xl bg-lingo-gray" />
        <div className="h-10 w-28 animate-pulse rounded-xl bg-lingo-gray" />
      </div>
      {/* Word cards */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border-2 border-lingo-border bg-white p-3"
          >
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 animate-pulse rounded bg-lingo-gray" />
              <div className="h-3 w-32 animate-pulse rounded bg-lingo-gray" />
            </div>
            <div className="h-5 w-10 animate-pulse rounded-full bg-lingo-gray" />
          </div>
        ))}
      </div>
    </div>
  );
}
