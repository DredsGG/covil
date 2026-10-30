// Atualização do Covil (regras 7, 14 e 15 do hub).
// - Procura versão nova nos Releases do GitHub (leitura pública, sem conta e sem mandar nada de ninguém).
// - Covil instalado pelo Covil-Setup: "Atualizar" baixa o Covil-Setup-X.Y.Z.exe do Release, confere o SHA-256
//   com o que o GitHub informa (campo "digest" do arquivo), fecha o app, instala em silêncio por cima e o
//   instalador reabre o Covil já na versão nova (--updated).
// - Cópia portátil (zip): baixa o mesmo Setup, confere e abre o instalador normal (a pessoa passa a ter o
//   Covil instalado, que se atualiza sozinho daqui para frente). Os dados ficam em %APPDATA%\Covil nos dois casos.
import { net } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SETUP_RE = /^Covil-Setup-(\d+\.\d+\.\d+)\.exe$/;

export function maisNova(a, b) {
  const pa = String(a || '').replace(/^v/, '').split('.').map(Number);
  const pb = String(b || '').replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

// o Covil instalado tem o desinstalador do electron-builder ao lado do exe
export const instalado = () => process.platform === 'win32' && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Covil.exe'));

// notas do Release no idioma da pessoa: o corpo tem a seção em inglês e <details> em português e espanhol
export function notasNoIdioma(corpo, lang) {
  const txt = String(corpo || '').replace(/\r/g, '');
  const sec = (nome) => {
    const m = new RegExp(`<details><summary>${nome}</summary>([\\s\\S]*?)</details>`, 'i').exec(txt);
    return m ? m[1] : null;
  };
  const bloco = (lang === 'pt' && sec('Português')) || (lang === 'es' && sec('Español')) || txt.split(/<details>|^### Install/m)[0];
  return bloco.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`/g, '').trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('<')).slice(0, 12);
}

export async function procurar(urlReleases, versaoAtual, lang) {
  const r = await net.fetch(urlReleases, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Covil' } });
  if (r.status === 404) return { current: versaoAtual, latest: null };
  if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
  const j = await r.json();
  const latest = String(j.tag_name || '').replace(/^v/, '');
  const assets = j.assets || [];
  const s = assets.find((a) => SETUP_RE.test(a.name || ''));
  const zip = assets.find((a) => /\.zip$/i.test(a.name || ''));
  return {
    // só avisa quando o Release já tem o instalador conferido (v0.7.2): o aviso não chega antes de ter o que baixar
    current: versaoAtual, latest, newer: maisNova(latest, versaoAtual) && (process.platform !== 'win32' || /^sha256:/i.test(s?.digest || '')),
    // versão urgente (regra 14d): o André põe "URGENTE" no título do Release
    urgente: /URGENTE/i.test(String(j.name || '')),
    notes: j.body || '', resumo: notasNoIdioma(j.body, lang), url: j.html_url,
    download: s?.browser_download_url || zip?.browser_download_url || j.html_url,
    setup: s ? { name: s.name, url: s.browser_download_url, size: s.size || 0, digest: s.digest || '' } : null,
    instalado: instalado(),
  };
}

export const pastaDownloads = () => path.join(os.tmpdir(), 'Covil-atualizacao');

// baixa o Setup e confere o SHA-256; devolve o caminho do arquivo conferido
export async function baixarSetup(setup, onProgresso = () => {}) {
  if (!setup?.url || !SETUP_RE.test(setup.name || '')) throw new Error('Release sem o Covil-Setup');
  const esperado = /^sha256:([0-9a-f]{64})$/i.exec(setup.digest || '')?.[1]?.toLowerCase();
  if (!esperado) throw new Error('O GitHub não informou o SHA-256 do instalador; atualize pela página do Release');
  fs.mkdirSync(pastaDownloads(), { recursive: true });
  const destino = path.join(pastaDownloads(), setup.name);
  const r = await net.fetch(setup.url, { headers: { 'user-agent': 'Covil' } });
  if (!r.ok || !r.body) throw new Error('Download falhou (' + r.status + ')');
  const total = Number(r.headers.get('content-length')) || setup.size || 0;
  const hash = crypto.createHash('sha256');
  const tmp = destino + '.part';
  const out = fs.createWriteStream(tmp);
  let feito = 0;
  const leitor = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      hash.update(value);
      feito += value.length;
      if (!out.write(value)) await new Promise((ok) => out.once('drain', ok));
      onProgresso(total ? feito / total : 0);
    }
  } finally { await new Promise((ok) => out.end(ok)); }
  const obtido = hash.digest('hex');
  if (obtido !== esperado) { fs.rmSync(tmp, { force: true }); throw new Error('SHA-256 não confere: o arquivo baixado não é o publicado. Nada foi instalado.'); }
  fs.renameSync(tmp, destino);
  return destino;
}

export async function sha256Arquivo(p) {
  const h = crypto.createHash('sha256');
  await new Promise((ok, erro) => fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', ok).on('error', erro));
  return h.digest('hex');
}

// roda o instalador e fecha o app. Instalado: em silêncio, por cima, e reabre sozinho.
// Portátil: o instalador normal (a pessoa vê as telas e escolhe o atalho).
export function aplicarSetup(arquivo, { silencioso = instalado(), sair } = {}) {
  if (!SETUP_RE.test(path.basename(arquivo))) throw new Error('arquivo de instalador inválido');
  const args = silencioso ? ['/S', '--updated', '--force-run'] : [];
  const p = spawn(arquivo, args, { detached: true, stdio: 'ignore', windowsHide: false });
  p.unref();
  setTimeout(() => sair?.(), 400);
  return { silencioso };
}
