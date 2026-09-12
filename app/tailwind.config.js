/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", "[data-mode='dark']"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        cb: {
          bg: "var(--cb-bg)",
          sidebar: "var(--cb-sidebar)",
          surface: "var(--cb-surface)",
          border: "var(--cb-border)",
          text: "var(--cb-text)",
          muted: "var(--cb-muted)",
          accent: "var(--cb-accent)",
          accentHover: "var(--cb-accent-hover)",
          user: "var(--cb-user-bubble)",
        },
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "fade-up": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "fade-up": "fade-up 250ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
