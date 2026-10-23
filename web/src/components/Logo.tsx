export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8"
        fill="var(--rt-accent-soft)"
        stroke="color-mix(in srgb, var(--rt-accent) 18%, transparent)"
      />
      <path
        d="M11 9.5v13M11 16h7.5M11 22.5h7.5"
        stroke="var(--rt-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="11" cy="9.5" r="2.5" fill="var(--rt-accent)" />
      <circle cx="21" cy="16" r="2.5" fill="var(--rt-accent)" />
      <circle cx="21" cy="22.5" r="2.5" fill="none" stroke="var(--rt-accent)" strokeWidth="1.8" />
    </svg>
  );
}
