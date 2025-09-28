module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        electric: "#FFDD00",
        fire: "#FF6F61",
        water: "#4FC3F7",
        grass: "#81C784",
        psychic: "#BA68C8",
      },
      boxShadow: {
        'pokemon': "0 4px 15px rgba(0,0,0,0.25), 0 0 12px rgba(255,215,0,0.5)",
      },
    },
  },
  plugins: [],
}
