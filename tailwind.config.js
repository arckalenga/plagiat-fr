/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201c",
        forest: { 50: "#eef7f2", 100: "#d8ede1", 500: "#287a55", 700: "#18563c", 900: "#12372a" },
        sand: "#f4f0e6",
        coral: "#e66b50"
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui"], display: ["Georgia", "serif"] },
      boxShadow: { soft: "0 18px 50px rgba(18,55,42,.10)" }
    }
  },
  plugins: []
};
