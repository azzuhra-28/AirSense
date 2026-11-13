// Konfigurasi ESLint 9 (flat config).
// eslint-config-next sudah mengekspor flat config, jadi cukup diteruskan.
import next from "eslint-config-next";

const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Mengambil data saat komponen dipasang memang memanggil setState
      // di dalam effect. Pola ini disengaja di seluruh halaman, jadi
      // diturunkan menjadi peringatan, bukan disembunyikan.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
