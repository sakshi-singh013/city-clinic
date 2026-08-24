/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101C24",
        paper: "#F4F6F4",
        line: "#DCE1DD",
        pulse: { DEFAULT: "#0F7A6C", soft: "#E3F1EE", dark: "#0B5A50" },
        alert: { DEFAULT: "#C6432E", soft: "#FBEAE6" },
        gold: { DEFAULT: "#B08234", soft: "#F5EEDD" },
        slate: { DEFAULT: "#585A8C", soft: "#EBEBF3" }
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"]
      },
      borderRadius: {
        card: "10px"
      }
    }
  },
  plugins: []
};
