import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Chatbox — All-in-one AI chat client",
  description: "A local-first, multi-model AI chat client. Chat with OpenAI, Claude, Gemini, DeepSeek, Ollama, and more.",
  appleWebApp: {
    capable: true,
    title: "Chatbox",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#2f6feb",
};

const foucScript = `
(function () {
  try {
    var raw = localStorage.getItem("chatbox-clone-state-v3");
    if (!raw) return;
    var s = JSON.parse(raw).state || {};
    var theme = s.theme || "default";
    var mode = s.mode || "dark";
    if (mode === "system") {
      mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", theme === "custom" ? "mist-blue" : theme);
    root.setAttribute("data-mode", mode);
    if (s.customColor && theme === "custom") {
      root.style.setProperty("--cb-accent", s.customColor);
      root.style.setProperty("--cb-accent-hover", s.customColor);
      root.style.setProperty("--cb-user-bubble", s.customColor);
    }
    if (s.fontSize) root.style.setProperty("--cb-font-size", s.fontSize + "px");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#2f6feb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: `
${foucScript}
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
` }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
