export default function UnitLoading() {
  return (
    <div className="mx-auto max-w-lg animate-pulse">
      <div className="mb-6 text-center">
        <div className="mx-auto h-8 w-48 rounded-lg bg-lingo-gray" />
        <div className="mx-auto mt-2 h-4 w-32 rounded-lg bg-lingo-gray" />
      </div>
      <div className="rounded-2xl border-2 border-lingo-gray bg-white p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-lingo-gray" />
          <div className="flex-1">
            <div className="h-5 w-40 rounded bg-lingo-gray mb-1" />
            <div className="h-4 w-56 rounded bg-lingo-gray" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-lingo-gray" />
              <div className="mt-2 h-3 w-20 rounded bg-lingo-gray" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
