import { BlockList, isIP } from 'net';

type Headers = Record<string, string | string[] | undefined>;

function subnets(ranges: string[]): BlockList {
  const list = new BlockList();
  for (const range of ranges) {
    const [address, prefix] = range.split('/');
    list.addSubnet(address, Number(prefix), address.includes(':') ? 'ipv6' : 'ipv4');
  }
  return list;
}

/** https://www.cloudflare.com/ips/ */
const CLOUDFLARE = subnets([
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
]);

const PRIVATE = subnets([
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '::1/128', 'fc00::/7',
]);

function contains(list: BlockList, ip: string): boolean {
  return list.check(ip, ip.includes(':') ? 'ipv6' : 'ipv4');
}

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalize(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, '');
}

/**
 * The visitor's address, for rate limits. Each header only counts if the hop before it can vouch for it:
 * our reverse proxy (a private address) writes the last X-Forwarded-For entry, and Cloudflare, recognised by that
 * entry, writes CF-Connecting-IP. Anything further left in the header, or a header sent straight at us, is the
 * client's own claim and gets ignored.
 */
export function clientIp(peerAddress: string | undefined, headers: Headers): string {
  const peer = normalize(peerAddress ?? '');
  if (!isIP(peer) || !contains(PRIVATE, peer)) return peer;

  const lastHop = normalize(header(headers, 'x-forwarded-for')?.split(',').pop() ?? '');
  if (!isIP(lastHop)) return peer;
  if (!contains(CLOUDFLARE, lastHop)) return lastHop;

  const visitor = normalize(header(headers, 'cf-connecting-ip') ?? '');
  return isIP(visitor) ? visitor : lastHop;
}

/** Stops other sites opening a socket from a visitor's browser. Tools send no Origin and need no protection. */
export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class TokenBucket {
  private tokens: number;
  private refilledAt: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.refilledAt = now();
  }

  take(): boolean {
    const time = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((time - this.refilledAt) / 1000) * this.perSecond);
    this.refilledAt = time;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
