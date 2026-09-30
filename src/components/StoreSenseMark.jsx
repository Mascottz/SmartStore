export default function StoreSenseMark({ className = 'h-5 w-5', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M17.5 7.5c-1.7-2.2-5.9-2.2-8-.2-1.4 1.4-.9 3.3.9 4.1l4.2 1.8c1.9.8 2.3 2.7.9 4.1-2.1 2-6.3 2-8-.2" />
      <circle cx="17.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="17.1" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
