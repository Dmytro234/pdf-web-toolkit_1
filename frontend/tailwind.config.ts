import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#E84040",
        topbar: "#1A1D23",
        surface: {
          DEFAULT: "#111318",
          2: "#151923",
          3: "#1B2030"
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.10)"
        }
      },
      fontFamily: {
        syne: ["Syne", "ui-sans-serif", "system-ui", "sans-serif"],
        dmsans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.35)",
        card: "0 12px 40px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
} satisfies Config;