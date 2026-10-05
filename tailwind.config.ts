import type { Config } from "tailwindcss"
import animate from "tailwindcss-animate"

/**
 * Semantic tokens live in `src/index.css` as CSS variables (light + dark).
 * Tailwind references them by name so components never hard-code raw hex values
 * (see the "color-semantic" design rule).
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        foreground: "var(--fg)",
        /** 通道形式，使 text-subtle/70 之类的透明度修饰符可正常生成 */
        subtle: "rgb(var(--sub-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        border: "var(--border)",
        input: "var(--border)",
        ring: "rgb(var(--ring-rgb) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)",
          /** Solid fill for controls that carry white text (buttons, FAB). */
          solid: "var(--primary-solid)",
          hover: "var(--primary-hover)",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          /** Darker accent for solid fills with white text. */
          solid: "var(--accent-solid)",
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive-rgb) / <alpha-value>)",
          /** Destructive colour when used as text on a surface. */
          text: "var(--destructive-text)",
          foreground: "#FFFFFF",
        },
        folder: "rgb(var(--folder-rgb) / <alpha-value>)",
        file: "rgb(var(--file-rgb) / <alpha-value>)",
        overlay: "var(--overlay)",
      },
      borderRadius: {
        card: "10px",
        input: "8px",
        lg: "10px",
        md: "8px",
        sm: "6px",
        xl: "16px",
      },
      fontFamily: {
        sans: [
          "'Plus Jakarta Sans'",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          "sans-serif",
        ],
      },
      spacing: {
        18: "4.5rem",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "0 0" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.3s ease infinite",
        "slide-up": "slide-up 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionTimingFunction: {
        ui: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [animate],
} satisfies Config
