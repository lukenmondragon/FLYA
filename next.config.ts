import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquetes con binarios nativos o pensados solo para Node: no se empaquetan.
  serverExternalPackages: ["@libsql/client", "postgres"],
  // Los datasets de /data se leen en tiempo de ejecución desde las rutas de API.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
  poweredByHeader: false,
  agentRules: false,
};

export default nextConfig;
