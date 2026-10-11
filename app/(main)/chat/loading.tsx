export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Messages area */}
      <div className="flex-1 space-y-4 overflow-hidden px-4 py-6">
        {/* Assistant message skeleton */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-lingo-gray" />
          <div className="space-y-2">
            <div className="h-4 w-64 animate-pulse rounded bg-lingo-gray" />
            <div className="h-4 w-48 animate-pulse rounded bg-lingo-gray" />
          </div>
        </div>
      </div>
      {/* Input area skeleton */}
      <div className="border-t-2 border-lingo-border p-4">
        <div className="h-12 w-full animate-pulse rounded-xl bg-lingo-gray" />
      </div>
    </div>
  );
}
