import type { SVGProps } from "react";

export default function IrisIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 12s3.4-5 9-5 9 5 9 5-3.4 5-9 5-9-5-9-5Z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M18.5 4.5v3" />
      <path d="M17 6h3" />
      <path d="M5 19.5l2-2" />
    </svg>
  );
}
