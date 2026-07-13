/** @type {import('tailwindcss').Config} */
// Tema Sopra (Sistema de Design). Remapeia as escalas padrão do Tailwind
// para a paleta Sopra, então as classes já usadas nos componentes
// (text-gray-500, bg-blue-600, border-slate-200...) passam a renderizar
// no padrão sem precisar reescrever componente.
//   gray/slate -> neutros quentes (papel/tinta)
//   blue       -> rampa verde-oliva/mostarda (accent primário)
const neutro = {
  50: "#F7F5F0",  // papel
  100: "#EFEAE0", // papel-2
  200: "#E4DED2", // linha
  300: "#D8D0C1", // linha-2
  400: "#A8A093", // fraco
  500: "#7C7568", // muted
  600: "#5F594E",
  700: "#4A463D", // tinta-suave
  800: "#33302A",
  900: "#22201B", // tinta
  950: "#1A1814",
};
const oliva = {
  50: "#F4F6EA",
  100: "#E7EECD",
  200: "#D3E0A5",
  300: "#B4C978",
  400: "#94B048",
  500: "#7AA436", // verde mostarda (marca)
  600: "#5A7A1F", // botão (texto branco legível ~5:1)
  700: "#4C6B1B", // hover
  800: "#3E571A",
  900: "#334718",
  950: "#24310F",
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: neutro,
        slate: neutro,
        blue: oliva,
        // tokens nomeados p/ uso futuro
        papel: "#F7F5F0",
        tinta: "#22201B",
        mostarda: "#7AA436",
        verde: "#5A7A1F",
        linha: "#E4DED2",
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "-apple-system", "sans-serif"],
        serif: ["'DM Serif Display'", "Georgia", "serif"],
        mono: ["'DM Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
