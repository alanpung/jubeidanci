export default function ReadLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-lingo-gray mb-6" />
      <div className="mb-6 flex justify-center">
        <div className="h-10 w-32 animate-pulse rounded-xl bg-lingo-gray" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border-2 border-lingo-border bg-white p-4"
          >
            <div className="h-8 w-8 shrink-0 animate-pulse rounded bg-lingo-gray" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-lingo-gray" />
              <div className="h-3 w-32 animate-pulse rounded bg-lingo-gray" />
              <div className="flex gap-1.5 mt-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-lingo-gray" />
                <div className="h-5 w-10 animate-pulse rounded-full bg-lingo-gray" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
