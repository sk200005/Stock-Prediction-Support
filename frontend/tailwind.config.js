/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#111827",
        panelBorder: "#1f2937",
      },
      boxShadow: {
        soft: "0 10px 35px rgba(15, 23, 42, 0.35)",
      },
    },
  },
  plugins: [],
};

