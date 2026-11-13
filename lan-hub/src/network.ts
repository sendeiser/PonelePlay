import os from "node:os";

const VIRTUAL_IFACE_PATTERN =
  /(vethernet|wsl|docker|virtualbox|vmware|vbox|hyper-v|loopback|teredo|isatap|tailscale|zerotier|radmin|hamachi|wireguard|openvpn|wintun|npcap|\bvpn\b|\btun\d*\b|\btap\d*\b)/i;

export interface LanAddressInfo {
  interfaceName: string;
  address: string;
  isVirtual: boolean;
}

function isPrivateLanIpv4(ip: string): boolean {
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

/**
 * Returns non-internal IPv4 addresses sorted with physical Wi-Fi / Ethernet adapters first.
 */
export function getLocalLanAddresses(): LanAddressInfo[] {
  const ifaces = os.networkInterfaces();
  const candidates: LanAddressInfo[] = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue; // Ignore APIPA link-local
      candidates.push({
        interfaceName: name,
        address: addr.address,
        isVirtual: VIRTUAL_IFACE_PATTERN.test(name),
      });
    }
  }

  return candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    const score = (ip: string) =>
      ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : isPrivateLanIpv4(ip) ? 2 : 3;
    return score(a.address) - score(b.address);
  });
}

export function getPrimaryLanIp(): string | null {
  const list = getLocalLanAddresses();
  return list[0]?.address ?? null;
}

