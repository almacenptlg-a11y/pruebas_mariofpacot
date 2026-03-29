/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}"], // Escanea tu HTML y JS actual
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    // ✅ Agregamos el plugin aquí para blindar la utilidad
    require('tailwind-scrollbar-hide')
  ],
}
