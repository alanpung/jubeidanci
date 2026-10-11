import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-lingo-bg p-4 text-center">
      <div className="text-6xl font-black text-lingo-blue mb-4">404</div>
      <h1 className="text-2xl font-black text-lingo-text mb-2">Page Not Found</h1>
      <p className="text-sm font-bold text-lingo-text-light mb-6 max-w-sm">
        Sorry, we couldn&apos;t find the page you were looking for. Let&apos;s get you back to learning!
      </p>
      <Link
        href="/library"
        className="px-6 py-3 text-sm font-bold uppercase tracking-wide text-white bg-lingo-green hover:bg-lingo-green/90 rounded-2xl border-b-4 border-lingo-green-dark active:border-b-0 active:translate-y-1 transition-all"
      >
        Go to Library
      </Link>
    </div>
  );
}
