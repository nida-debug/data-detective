/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0A0E14",
          900: "#10151D",
          800: "#161C26",
          700: "#1F2733",
          600: "#2A3341",
        },
        signal: {
          400: "#3DDC97",
          500: "#2BC482",
        },
        amber: {
          400: "#F0A868",
        },
        danger: {
          400: "#E5484D",
        },
        inktext: {
          100: "#E8EAED",
          400: "#8B93A1",
          600: "#576174",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
