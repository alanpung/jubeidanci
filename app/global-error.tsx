"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center p-4 font-sans text-center">
        <h2 className="text-xl font-bold mb-2">Something went wrong!</h2>
        <p className="text-sm text-gray-500 mb-4">{error?.message || "An unexpected error occurred."}</p>
        <button
          onClick={() => reset()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
