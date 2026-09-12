"use client";

// Role-based SVG agent avatars — small, premium, gradient-backed.
// Each role gets its own character so the team feels like real specialists.

import { motion } from "motion/react";

const ROLE_ART = {
  ceo: {
    bg: "linear-gradient(135deg,#f59e0b,#c2410c)",
    art: (
      <>
        {/* CEO — crown + suit */}
        <path d="M14 10 l4 4 6-7 6 7 4-4 v6 a10 6 0 0 1 -20 0 z" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
        <circle cx="17" cy="11" r="1.8" fill="#fef3c7" />
        <circle cx="24" cy="7" r="1.8" fill="#fef3c7" />
        <circle cx="31" cy="11" r="1.8" fill="#fef3c7" />
        {/* head */}
        <circle cx="24" cy="24" r="9" fill="#0f172a" />
        <circle cx="20.5" cy="23" r="1.8" fill="#fde68a" />
        <circle cx="27.5" cy="23" r="1.8" fill="#fde68a" />
        <rect x="20" y="27.5" width="8" height="2" rx="1" fill="#fbbf24" />
        {/* suit + tie */}
        <path d="M14 44 v-8 c0-3 3-5 6-5 l4 4 4-4 c3 0 6 2 6 5 v8 z" fill="#0f172a" />
        <path d="M24 33 l3 3 -3 6 -3-6 z" fill="#f59e0b" />
      </>
    ),
  },
  coder: {
    bg: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
    art: (
      <>
        {/* robot head with laptop */}
        <rect x="12" y="8" width="24" height="18" rx="6" fill="#0f172a" />
        <circle cx="20" cy="17" r="3" fill="#93c5fd" />
        <circle cx="28" cy="17" r="3" fill="#93c5fd" />
        <rect x="21" y="23" width="6" height="2.5" rx="1" fill="#60a5fa" />
        {/* antenna */}
        <line x1="24" y1="3" x2="24" y2="8" stroke="#93c5fd" strokeWidth="2" />
        <circle cx="24" cy="2.5" r="2" fill="#bfdbfe" />
        {/* laptop */}
        <rect x="13" y="30" width="22" height="12" rx="2" fill="#1e293b" />
        <rect x="15.5" y="32" width="17" height="8" rx="1" fill="#3b82f6" opacity="0.7" />
        {/* typing hands */}
        <circle cx="16" cy="43" r="2.5" fill="#93c5fd" />
        <circle cx="32" cy="43" r="2.5" fill="#93c5fd" />
      </>
    ),
  },
  reviewer: {
    bg: "linear-gradient(135deg,#22c55e,#15803d)",
    art: (
      <>
        {/* inspector with magnifier over shield */}
        <circle cx="20" cy="16" r="9" fill="#0f172a" />
        <circle cx="17" cy="15" r="1.5" fill="#bbf7d0" />
        <circle cx="23" cy="15" r="1.5" fill="#bbf7d0" />
        <rect x="16" y="20" width="8" height="2" rx="1" fill="#86efac" />
        {/* shield body */}
        <path d="M32 12 l8 3 v7 c0 6-4 10-8 12 c-4-2-8-6-8-12 v-7 z" fill="#065f46" />
        <path d="M35.5 19 l2.5 2.5 4.5-5" stroke="#4ade80" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* clipboard */}
        <rect x="10" y="32" width="16" height="12" rx="2" fill="#064e3b" />
        <rect x="14" y="28" width="8" height="4" rx="1.5" fill="#22c55e" />
        <line x1="13" y1="36" x2="23" y2="36" stroke="#34d399" strokeWidth="1.5" />
        <line x1="13" y1="39.5" x2="21" y2="39.5" stroke="#34d399" strokeWidth="1.5" />
      </>
    ),
  },
  researcher: {
    bg: "linear-gradient(135deg,#a855f7,#7e22ce)",
    art: (
      <>
        {/* scholar with big magnifier + book stack */}
        <circle cx="18" cy="15" r="8" fill="#0f172a" />
        <circle cx="15.5" cy="14" r="1.5" fill="#e9d5ff" />
        <circle cx="20.5" cy="14" r="1.5" fill="#e9d5ff" />
        <rect x="14" y="18.5" width="8" height="2" rx="1" fill="#c084fc" />
        {/* magnifier */}
        <circle cx="33" cy="20" r="8" fill="rgba(233,213,255,0.15)" stroke="#d8b4fe" strokeWidth="2.5" />
        <line x1="38.5" y1="25.5" x2="44" y2="31" stroke="#d8b4fe" strokeWidth="3.5" strokeLinecap="round" />
        {/* sparkle */}
        <path d="M33 15 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2-3 -3-1.2 3-1.2 z" fill="#f3e8ff" />
        {/* books */}
        <rect x="8" y="34" width="18" height="4" rx="1" fill="#7e22ce" />
        <rect x="10" y="39" width="14" height="4" rx="1" fill="#a855f7" />
      </>
    ),
  },
  tester: {
    bg: "linear-gradient(135deg,#f59e0b,#b45309)",
    art: (
      <>
        {/* lab-coat tester with flask */}
        <circle cx="20" cy="14" r="8" fill="#0f172a" />
        <circle cx="17.5" cy="13" r="1.5" fill="#fde68a" />
        <circle cx="22.5" cy="13" r="1.5" fill="#fde68a" />
        <rect x="16" y="17.5" width="8" height="2" rx="1" fill="#fbbf24" />
        {/* flask */}
        <path d="M31 12 h8 l-2.5 8 v10 a2 2 0 0 1 -2 2 h-1 a2 2 0 0 1 -2-2 v-10 z" fill="#78350f" />
        <path d="M32.5 22 h5 l-1.5 6 a1.5 1.5 0 0 1 -1.5 1.2 h-.5 a1.5 1.5 0 0 1 -1.5-1.2 z" fill="#f59e0b" />
        {/* bubbles */}
        <circle cx="34.5" cy="19" r="1.2" fill="#fde68a" opacity="0.9" />
        <circle cx="36.5" cy="25" r="0.9" fill="#fde68a" opacity="0.7" />
        {/* checklist */}
        <rect x="8" y="32" width="15" height="4" rx="1" fill="#b45309" />
        <rect x="8" y="39" width="11" height="4" rx="1" fill="#92400e" />
      </>
    ),
  },
};

export default function AgentAvatar({ role, name, size = 24, className = "", working = false }) {
  const art = ROLE_ART[role] || ROLE_ART.coder;
  const initial = name ? name[0] : null;
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={name || role}
      animate={working
        ? { scale: [1, 1.1, 1], filter: ["drop-shadow(0 0 0px rgba(255,255,255,0))", "drop-shadow(0 0 6px rgba(255,255,255,0.45))", "drop-shadow(0 0 0px rgba(255,255,255,0))"] }
        : { scale: 1, filter: "drop-shadow(0 0 0px rgba(255,255,255,0))" }}
      transition={working ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
    >
      <defs>
        <clipPath id={`clip-${role}-${size}`}>
          <rect width="48" height="48" rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${role}-${size})`}>
        <rect width="48" height="48" fill={art.bg} />
        {art.art}
      </g>
      <rect width="47" height="47" x="0.5" y="0.5" rx="11.5" fill="none" stroke={working ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)"} />
      {initial && (
        <text x="40" y="43" textAnchor="end" fontSize="9" fontWeight="800" fill="rgba(255,255,255,0.75)" fontFamily="Inter, system-ui">
          {initial}
        </text>
      )}
    </motion.svg>
  );
}
