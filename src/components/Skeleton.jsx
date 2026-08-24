// src/components/Skeleton.jsx
// Animated placeholder for loading states.

export function SkeletonLine({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
      <SkeletonLine className="h-4 w-1/3" />
      <SkeletonLine className="h-8 w-2/3" />
      <SkeletonLine className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <SkeletonLine className="h-4 w-1/4" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine
              key={j}
              className={`h-4 ${j === 0 ? 'w-1/4' : 'w-1/6'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
