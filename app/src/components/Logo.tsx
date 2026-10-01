/** The app icon, redrawn at UI size. Keep in sync with scripts/generate-icon.mjs. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2bbfb9" />
          <stop offset="1" stopColor="#128a88" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.4" fill="url(#logo-sea)" />
      <circle cx="29.1" cy="28.5" r="15" fill="none" stroke="#fff" strokeWidth="5.1" />
      <path d="M39.7 39.1 L49.9 49.3" stroke="#fff" strokeWidth="6.1" strokeLinecap="round" />
      <circle cx="29.1" cy="28.5" r="4.5" fill="#ffb547" />
    </svg>
  );
}
