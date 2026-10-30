import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';

const MAX_CONTENT = 20_000;
const TIMEOUT_MS = 30_000;

function ipv4Number(address) {
  return address.split('.').reduce((value, part) => (value * 256) + Number(part), 0) >>> 0;
}

function inV4Range(address, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return ![
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ].some(([base, bits]) => inV4Range(address, base, bits));
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7));
  if (!/^2[0-9a-f]{3}:/.test(normalized)) return false;
  const [firstWord, secondWord = '0'] = normalized.split(':');
  const first = Number.parseInt(firstWord, 16);
  const second = Number.parseInt(secondWord, 16);
  return !(first === 0x2001 && second <= 0x01ff) && first !== 0x2002 && first !== 0x3fff;
}

async function publicAddresses(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Destino sem resolução pública ou com endereço local/privado bloqueado.');
  return addresses;
}

async function assertPublicHttpUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('URL inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Somente URLs HTTP e HTTPS são permitidas.');
  if (url.username || url.password) throw new Error('URLs com credenciais não são permitidas.');
  await publicAddresses(url.hostname);
  return url.href;
}

function startPinnedProxy() {
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    let target;
    try {
      target = new URL(request.url);
      if (target.protocol !== 'http:' || target.username || target.password) throw new Error('unsupported');
      const addresses = await publicAddresses(target.hostname);
      const port = Number(target.port || 80);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('bad port');
      const upstream = net.connect({ host: addresses[0].address, family: net.isIP(addresses[0].address), port });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      upstream.once('error', () => response.destroy());
      upstream.once('connect', () => {
        const path = `${target.pathname || '/'}${target.search}`;
        upstream.write(`${request.method} ${path} HTTP/${request.httpVersion}\r\n`);
        for (const [name, value] of Object.entries(request.headers)) {
          if (name !== 'proxy-connection' && name !== 'proxy-authorization') upstream.write(`${name}: ${value}\r\n`);
        }
        upstream.write('\r\n');
        request.pipe(upstream);
        upstream.pipe(response);
      });
    } catch {
      response.writeHead(403, { connection: 'close' }).end();
      request.destroy();
    }
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', async (request, client, head) => {
    let upstream;
    try {
      const target = new URL(`https://${request.url}/`);
      if (target.username || target.password || target.pathname !== '/') throw new Error('bad CONNECT');
      const addresses = await publicAddresses(target.hostname);
      const portText = request.url.slice(request.url.lastIndexOf(':') + 1);
      const port = Number(portText);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('bad port');
      upstream = net.connect({ host: addresses[0].address, family: net.isIP(addresses[0].address), port });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      upstream.once('error', () => client.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      upstream?.destroy();
    }
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({ server, sockets, port: server.address().port });
    });
  });
}

export async function openPublicPage({ url: input, includeContent = true }) {
  const initialUrl = await assertPublicHttpUrl(input);
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright não está instalado. Execute npm install e npx playwright install chromium.'); }
  const proxy = await startPinnedProxy();
  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: '<-loopback>' },
      args: ['--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND'],
    });
    context = await browser.newContext({ serviceWorkers: 'block', javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT_MS);
    page.setDefaultTimeout(TIMEOUT_MS);
    await context.route('**/*', async route => {
      try {
        const requestUrl = new URL(route.request().url());
        if (!['http:', 'https:'].includes(requestUrl.protocol) || requestUrl.username || requestUrl.password) throw new Error('blocked');
        await publicAddresses(requestUrl.hostname);
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    const result = { url: page.url(), title: title.slice(0, 1_000) };
    if (includeContent) {
      const content = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
      result.content = content.slice(0, MAX_CONTENT);
      result.truncated = content.length > MAX_CONTENT;
    }
    return result;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    for (const socket of proxy.sockets) socket.destroy();
    proxy.server.closeAllConnections();
    await new Promise(resolve => proxy.server.close(resolve));
  }
}
