import ipaddr from "ipaddr.js";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

/** Conservative global-unicast allow policy, including IPv4-mapped IPv6 rejection. */
export function isPublicInternetAddress(input: string): boolean {
  if (!isIP(input) || input.includes("%")) return false;
  // Azure WireServer uses a public-looking virtual infrastructure address.
  if (input === "168.63.129.16") return false;
  const address = ipaddr.parse(input);
  if (address.range() !== "unicast") return false;
  if (address.kind() === "ipv4") {
    const v4 = address as ipaddr.IPv4;
    return !["192.0.0.0/24", "192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24", "198.18.0.0/15", "192.88.99.0/24"].some((cidr) => v4.match(ipaddr.IPv4.parseCIDR(cidr)));
  }
  const v6 = address as ipaddr.IPv6;
  return v6.match(ipaddr.IPv6.parseCIDR("2000::/3")) && !["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].some((cidr) => v6.match(ipaddr.IPv6.parseCIDR(cidr)));
}
export class RemotePolicyError extends Error {}
export async function resolvePublicTarget(url: URL): Promise<string> {
  if (!["http:", "https:"].includes(url.protocol)) throw new RemotePolicyError("remote_inspection_scheme_blocked");
  if (url.username || url.password) throw new RemotePolicyError("remote_inspection_credentials_blocked");
  if (url.port && url.port !== "80" && url.port !== "443") throw new RemotePolicyError("remote_inspection_port_blocked");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host.includes(".") && !isIP(host) || /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) throw new RemotePolicyError("remote_inspection_host_blocked");
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    const resolve = async (family: 4 | 6) => {
      try { return await (family === 4 ? resolve4(host) : resolve6(host)); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENODATA" || code === "ENOTFOUND") return [];
        throw new Error("remote_inspection_dns_failed");
      }
    };
    const [v4, v6] = await Promise.all([resolve(4), resolve(6)]);
    addresses = [...v4, ...v6];
  }
  if (!addresses.length) throw new Error("remote_inspection_dns_empty");
  if (!addresses.every(isPublicInternetAddress)) throw new RemotePolicyError("remote_inspection_private_ip_blocked");
  return addresses[0];
}
