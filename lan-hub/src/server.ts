import { PoneleLanHub } from "./hub";

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function main() {
  const port = Number(readArg("port") || process.env.LAN_HUB_PORT || 4321);
  const cloudWsUrl =
    readArg("cloud") ||
    process.env.CLOUD_WS_URL ||
    "wss://poneleplay-sync.martinsgons709.workers.dev";
  const originUrl =
    readArg("origin") || process.env.NEXT_APP_ORIGIN || "https://poneleplay.netlify.app";

  const targetPort = Number.isFinite(port) && port > 0 ? port : 4321;
  const hub = new PoneleLanHub({
    port: targetPort,
    defaultCloudWsUrl: cloudWsUrl,
    defaultOriginUrl: originUrl,
    enableMdns: true,
  });

  try {
    await hub.start();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "EADDRINUSE") {
      try {
        const res = await fetch(`http://127.0.0.1:${targetPort}/health`);
        if (res.ok) {
          const info = (await res.json()) as {
            service?: string;
            primaryIp?: string | null;
          };
          if (info.service === "poneleplay-lan-hub") {
            console.log("\n========================================================");
            console.log("  ✅ PONELEPLAY LAN HUB YA ESTA ACTIVO EN ESTA PC!");
            console.log("========================================================");
            console.log(`  El puerto ${targetPort} ya esta en uso por otra ventana de`);
            console.log("  PonelePlay LAN Hub funcionando correctamente.");
            if (info.primaryIp) {
              console.log(`  IP Wi-Fi/LAN activa: ${info.primaryIp}:${targetPort}`);
            }
            console.log(`  Estado en navegador: http://localhost:${targetPort}`);
            console.log("========================================================\n");
            return;
          }
        }
      } catch {
        // Ignore probe failure and fall through to generic conflict message
      }
      console.error(`\n[!] El puerto ${targetPort} ya esta ocupado por otro programa en esta PC.`);
      console.error(`    Cerra el programa que usa el puerto ${targetPort} o inicia con --port=4322.\n`);
      process.exit(1);
    }
    throw err;
  }
  const status = hub.getStatusSnapshot();

  console.log("\n========================================================");
  console.log("  ⚡ PONELEPLAY LAN HUB ACTIVO (< 2ms en red Wi-Fi/LAN)");
  console.log("========================================================");
  console.log(`  Panel local:    http://localhost:${status.port}`);
  console.log(`  Cabina (HTTPS): ws://127.0.0.1:${status.port}`);
  if (status.primaryIp) {
    console.log(`  IP Wi-Fi/LAN:   ${status.primaryIp}:${status.port}`);
  }
  console.log(
    `  mDNS Broadcast: ${status.mdnsPublished ? "_poneleplay._tcp.local. (activo)" : "no disponible"}`,
  );
  console.log(`  Bridge Cloud:   ${cloudWsUrl} (auto-anuncia tu IP a las TVs)`);
  console.log("--------------------------------------------------------");
  console.log("  No cierres esta ventana mientras uses las pantallas.");
  console.log("  Podés minimizarla; presioná Ctrl+C cuando termines.");
  console.log("========================================================\n");

  const shutdown = async () => {
    await hub.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Error al iniciar PonelePlay LAN Hub:", err);
  process.exit(1);
});

