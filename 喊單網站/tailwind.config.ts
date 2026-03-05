import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        paper: "#f8fafc",
        accent: {
          50: "#eefdf8",
          100: "#d6faec",
          500: "#16a34a",
          700: "#15803d",
          900: "#14532d"
        },
        coral: {
          500: "#fb7185",
          700: "#be123c"
        }
      },
      fontFamily: {
        display: ["'Noto Sans TC'", "sans-serif"],
        body: ["'Noto Sans TC'", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 45px -25px rgba(15, 23, 42, 0.25)",
      },
      backgroundImage: {
        grid: "radial-gradient(circle at center, rgba(15, 23, 42, 0.08) 1px, transparent 1px)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 0.45s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
