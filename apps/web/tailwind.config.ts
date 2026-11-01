import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        card: "var(--card)",
        elevated: "var(--elevated)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        text: "var(--text)",
        muted: "var(--muted)",
        line: "var(--line)",
        "on-accent": "var(--on-accent)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow)",
      },
      maxWidth: {
        reading: "960px",
      },
      width: {
        sidebar: "250px",
      },
    },
  },
};

export default config;
