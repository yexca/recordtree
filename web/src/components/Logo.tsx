import { useId } from 'react';

export function Logo({ size = 30 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f08aac" />
          <stop offset="1" stopColor="#a47ad6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <path d="M11 9.5v13M11 16h7.5M11 22.5h7.5" stroke="#ffe6ef" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="11" cy="9.5" r="2.6" fill="#fff" />
      <circle cx="21" cy="16" r="2.6" fill="#fff" />
      <circle cx="21" cy="22.5" r="2.6" fill="#ffd3e2" />
    </svg>
  );
}
