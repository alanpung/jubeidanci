export default function CourseLessonLoading() {
  return (
    <div className="mx-auto max-w-2xl flex flex-col items-center py-12">
      {/* Progress bar skeleton */}
      <div className="w-full max-w-md mb-8">
        <div className="h-3 w-full animate-pulse rounded-full bg-lingo-gray" />
      </div>
      {/* Exercise area skeleton */}
      <div className="w-full max-w-md space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-lingo-gray" />
        <div className="h-4 w-64 animate-pulse rounded bg-lingo-gray" />
        <div className="space-y-3 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 w-full animate-pulse rounded-xl bg-lingo-gray"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
