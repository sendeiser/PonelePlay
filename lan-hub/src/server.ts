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

  const hub = new PoneleLanHub({
    port: Number.isFinite(port) && port > 0 ? port : 4321,
    defaultCloudWsUrl: cloudWsUrl,
    defaultOriginUrl: originUrl,
    enableMdns: true,
  });

  await hub.start();
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

