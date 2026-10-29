// Covil Servidor na mesma casa (v0.7.0): pergunta por broadcast UDP na rede local "cadê o Covil?" e, se o Covil
// Servidor responde com o mesmo nome público do app, devolve o IP dele na rede de casa (conferido com uma conexão
// na porta do site). Fora de casa ninguém responde e o app segue pelo endereço público (no máximo ~0,5 s a mais).
import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';

export const PORTA_DESCOBERTA = 7701;
const privado = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

function atende(ip, porta, ms = 700) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: porta, timeout: ms });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

// endereços de broadcast de cada placa de rede privada (192.168.0.255 etc.) e o geral
function broadcasts() {
  const out = new Set(['255.255.255.255']);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family !== 'IPv4' || i.internal || !privado(i.address) || !i.netmask) continue;
      const a = i.address.split('.').map(Number); const m = i.netmask.split('.').map(Number);
      out.add(a.map((x, k) => (x & m[k]) | (~m[k] & 255)).join('.'));
    }
  }
  return [...out];
}

// alvos: os testes passam para onde perguntar; o normal são os broadcasts da rede de casa
export async function acharNaRede({ host, porta, ms = 500, alvos = null, portaDescoberta = Number(process.env.COVIL_PORTA_DESCOBERTA) || PORTA_DESCOBERTA }) {
  const temRedeLocal = alvos || Object.values(os.networkInterfaces()).flat().some((i) => i && i.family === 'IPv4' && !i.internal && privado(i.address));
  if (!temRedeLocal) return null;
  const ip = await new Promise((resolve) => {
    let s;
    try { s = dgram.createSocket('udp4'); } catch { return resolve(null); }
    const fim = (v) => { clearTimeout(t); try { s.close(); } catch {} resolve(v); };
    const t = setTimeout(() => fim(null), ms);
    s.on('error', () => fim(null));
    s.on('message', (m, rinfo) => {
      try { const j = JSON.parse(String(m)); if (j.covil === 1 && String(j.host).toLowerCase() === host.toLowerCase()) fim(rinfo.address); } catch {}
    });
    s.bind(0, () => {
      try { s.setBroadcast(true); } catch {}
      for (const b of alvos || broadcasts()) s.send('covil-onde?v1', portaDescoberta, b, () => {});
    });
  });
  if (ip && (await atende(ip, porta))) return ip;
  return null;
}
