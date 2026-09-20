/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      colors: {
        royal: {
          bg: "#040408",
          surface: "#0A0A14",
          card: "#121222",
          border: "#1E1E3A",
          primary: "#6366F1", // Indigo
          accent: "#F59E0B",  // Amber/Gold
          gold: "#FCD34D",
          text: "#F8FAFC",
          muted: "#94A3B8",
        },
      },
      boxShadow: {
        "glow-sm": "0 0 12px rgba(99, 102, 241, 0.35)",
        "glow": "0 0 30px rgba(99, 102, 241, 0.45)",
        "glow-gold": "0 0 30px rgba(245, 158, 11, 0.3)",
        "inner-glow": "inset 0 0 24px rgba(99, 102, 241, 0.15)",
      },
      backgroundImage: {
        "gradient-royal": "linear-gradient(to right, #6366F1, #A855F7, #6366F1)",
        "aurora":
          "radial-gradient(60% 60% at 20% 20%, rgba(99,102,241,0.25) 0%, transparent 60%), radial-gradient(55% 55% at 80% 30%, rgba(168,85,247,0.18) 0%, transparent 60%), radial-gradient(50% 50% at 50% 90%, rgba(245,158,11,0.12) 0%, transparent 60%)",
      },
      animation: {
        glow: "glow 2s ease-in-out infinite alternate",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 15px rgba(99, 102, 241, 0.2)" },
          "100%": { boxShadow: "0 0 35px rgba(99, 102, 241, 0.5)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%) skewX(-12deg)" },
          "100%": { transform: "translateX(220%) skewX(-12deg)" },
        },
      },
    },
  },
  plugins: [],
};
