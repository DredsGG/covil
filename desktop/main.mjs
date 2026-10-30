// App Windows do Covil (Electron): janela, bandeja, atalhos globais e seletor de tela com som. Desde a v0.7.0 é só o
// app: o servidor do Covil roda no Covil Servidor e o endereço dele vem fixo no app.
import { app, BrowserWindow, Tray, Menu, nativeImage, session, desktopCapturer, ipcMain, shell, globalShortcut, net, Notification, powerMonitor, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { procurar, baixarSetup, aplicarSetup, instalado, sha256Arquivo, pastaDownloads } from './atualizar.mjs';
import { limparInstaladores, acharCopiasAntigas, apagarCopias } from './limpeza.mjs';
import { criarAtalhos } from './atalhos.mjs';
import { vigiarJogos, programasComJanela } from './jogos.mjs';
import { acharNaRede } from './descoberta.mjs';
import dns from 'node:dns';
import netNode from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = app.getVersion();
const PKG = (() => { try { return JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')); } catch { return {}; } })();
const REPO = 'DredsGG/covil';
app.setAppUserModelId('gg.dreds.covil');

if (process.env.COVIL_USERDATA) app.setPath('userData', process.env.COVIL_USERDATA);
// testes do instalador no Windows do GitHub (regra 15): --autoteste=<json> abre e fecha; --atualizar-agora=<json> faz o
// mesmo caminho do botão "Atualizar" (procura, baixa, confere o SHA-256, instala em silêncio e o instalador reabre)
const argVal = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3).replace(/^"|"$/g, '') : null; };
const AUTOTESTE = argVal('autoteste');
const ATUALIZAR_AGORA = argVal('atualizar-agora');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const userData = app.getPath('userData');
const cfgPath = path.join(userData, 'config.json');
const logPath = path.join(userData, 'covil.log');
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}\n`;
  try { fs.appendFileSync(logPath, line); } catch {}
  console.log(line.trim());
}
function loadCfg() { try { return { closeToTray: true, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch { return { closeToTray: true }; } }
function saveCfg(c) { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); }
let cfg = loadCfg();
// o servidor do Covil (v0.7.0): vem fixo no app montado (segredo COVIL_SERVIDOR do repositório, gravado no
// package.json na montagem); COVIL_SERVIDOR no ambiente só para testes. Sem ele (cópia de desenvolvimento), pede.
const SERVIDOR = (() => { try { const u = new URL(process.env.COVIL_SERVIDOR || PKG.covilServidor || ''); return u.origin; } catch { return ''; } })();
// quem era o anfitrião até a v0.6.1 vira só app: os dados do servidor antigo ficam onde estavam
if (cfg.mode === 'host') {
  const antes = cfg.duckdns?.domain ? `https://${cfg.duckdns.domain}.duckdns.org:8443` : '';
  cfg.servidorAntigo = { ...(cfg.servidorAntigo || {}), em: new Date().toISOString(), dados: path.join(app.getPath('userData'), 'servidor') };
  cfg.mode = (SERVIDOR || antes) ? 'client' : null;
  cfg.serverUrl = SERVIDOR || antes;
  saveCfg(cfg);
  log(`v${VERSION}: este PC deixou de ser o anfitrião (o servidor agora é o Covil Servidor); dados antigos guardados`);
}
if (SERVIDOR && (cfg.mode !== 'client' || cfg.serverUrl !== SERVIDOR)) { cfg.mode = 'client'; cfg.serverUrl = SERVIDOR; saveCfg(cfg); }
// Releases do GitHub (regra 7/14); COVIL_RELEASES_URL só para os testes simularem uma versão nova
const RELEASES = process.env.COVIL_RELEASES_URL || `https://api.github.com/repos/${REPO}/releases/latest`;

// idioma do app (regra 13): o escolhido no Covil, senão o do Windows (pt, en ou es; o resto vira en)
const TXT = {
  pt: { abrir: 'Abrir o Covil', mutar: 'Mutar / desmutar', surdo: 'Ensurdecer', sair: 'Sair', novaT: 'Covil v{v} disponível', novaB: 'Clique para ver o que mudou e atualizar.', urgenteT: 'Atualização urgente do Covil (v{v})', urgenteB: 'Corrige um problema grave. Clique para atualizar; o Covil fica pausado até lá.', endereco: 'Endereço inválido', naoAbriu: 'Não consegui abrir o Covil ({d}).', naoAchei: 'Não achei um servidor do Covil em {o}. Confira o endereço.' },
  en: { abrir: 'Open Covil', mutar: 'Mute / unmute', surdo: 'Deafen', sair: 'Quit', novaT: 'Covil v{v} available', novaB: 'Click to see what changed and update.', urgenteT: 'Urgent Covil update (v{v})', urgenteB: 'It fixes a serious problem. Click to update; Covil stays paused until then.', endereco: 'Invalid address', naoAbriu: 'Couldn\'t open Covil ({d}).', naoAchei: 'Couldn\'t find a Covil server at {o}. Check the address.' },
  es: { abrir: 'Abrir Covil', mutar: 'Silenciar / activar micrófono', surdo: 'Ensordecer', sair: 'Salir', novaT: 'Covil v{v} disponible', novaB: 'Haz clic para ver qué cambió y actualizar.', urgenteT: 'Actualización urgente de Covil (v{v})', urgenteB: 'Corrige un problema grave. Haz clic para actualizar; Covil queda en pausa hasta entonces.', endereco: 'Dirección no válida', naoAbriu: 'No pude abrir Covil ({d}).', naoAchei: 'No encontré un servidor de Covil en {o}. Revisa la dirección.' },
};
function idioma() {
  if (['pt', 'en', 'es'].includes(cfg.idioma)) return cfg.idioma;
  const sys = [...(app.getPreferredSystemLanguages?.() || []), app.getLocale?.() || ''];
  for (const l of sys) { const b = String(l).toLowerCase().slice(0, 2); if (['pt', 'en', 'es'].includes(b)) return b; }
  return 'en';
}
const tx = (k, v = {}) => TXT[idioma()][k].replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m);

// site do servidor em http na rede local: libera microfone/tela (o Chrome exige "origem segura")
if (cfg.mode === 'client' && /^http:\/\//.test(cfg.serverUrl || '') && !/localhost|127\.0\.0\.1/.test(cfg.serverUrl)) {
  app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', new URL(cfg.serverUrl).origin);
}
// servidor na mesma casa (v0.7.0): o endereço público (DuckDNS) pode não voltar para dentro de casa (roteador sem
// "NAT loopback"). Se o Covil Servidor responde na rede de casa (descoberta por broadcast, ~meio segundo), o nome
// público é resolvido direto para o Mac: o cadeado continua valendo e a call fica na rede de casa.
if (cfg.mode === 'client' && /^https:/.test(cfg.serverUrl || '')) {
  try {
    const u = new URL(cfg.serverUrl);
    const achado = await acharNaRede({ host: u.hostname, porta: Number(u.port || 443), alvos: process.env.COVIL_DESCOBERTA_ALVOS?.split(',') });
    if (achado) {
      app.commandLine.appendSwitch('host-resolver-rules', `MAP ${u.hostname} ${achado}`);
      log(`Covil Servidor na rede de casa (${achado}): conexão direta`);
    }
  } catch {}
}
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowInputVolumeAdjustment');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const iconPath = path.join(here, 'icone.png');
let win = null;
let tray = null;
let quitting = false;
let pendingShare = null;

function serverOrigin() {
  try { return new URL(cfg.serverUrl).origin; } catch { return null; }
}
const trustedUrl = (url) => {
  try { return String(url).startsWith('file://') || new URL(url).origin === serverOrigin(); } catch { return false; }
};
const trusted = (wc) => !!wc && trustedUrl(wc.getURL());

// janela maior que a tela (v0.7.3): o tamanho salvo vinha de outro monitor ou resolução e a parte de baixo (botões
// da call) ficava atrás da barra de tarefas, mesmo trocando para janela. Agora o tamanho cabe na área útil da tela.
function cabeNaTela(b = {}) {
  const pedido = { x: Number.isFinite(b.x) ? b.x : 0, y: Number.isFinite(b.y) ? b.y : 0, width: b.width || 1360, height: b.height || 840 };
  const area = (screen.getDisplayMatching(pedido) || screen.getPrimaryDisplay()).workArea;
  const width = Math.max(Math.min(pedido.width, area.width), Math.min(940, area.width));
  const height = Math.max(Math.min(pedido.height, area.height), Math.min(560, area.height));
  const dentro = Number.isFinite(b.x) && Number.isFinite(b.y) && b.x >= area.x - 8 && b.y >= area.y - 8 && b.x + width <= area.x + area.width + 8 && b.y + height <= area.y + area.height + 8;
  return dentro ? { x: b.x, y: b.y, width, height } : { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
}

function createWindow() {
  const st = cfg.window || {};
  const b = cabeNaTela(st);
  win = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y, minWidth: Math.min(940, b.width), minHeight: Math.min(560, b.height),
    backgroundColor: '#18181b', title: 'Covil', icon: iconPath, show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: true },
  });
  if (st.maximized) win.maximize();
  // desmaximizar ou trocar de monitor/resolução: continua cabendo na tela
  const ajustar = () => { if (!win || win.isMaximized() || win.isFullScreen()) return; const atual = win.getBounds(); const n = cabeNaTela(atual); if (n.width !== atual.width || n.height !== atual.height || n.x !== atual.x || n.y !== atual.y) win.setBounds(n); };
  win.on('unmaximize', () => setTimeout(ajustar, 50));
  screen.on('display-metrics-changed', ajustar);
  screen.on('display-removed', ajustar);
  win.once('ready-to-show', () => { if (!process.argv.includes('--escondido')) win.show(); });

  win.on('close', (e) => {
    const b = win.getNormalBounds();
    cfg.window = { ...b, maximized: win.isMaximized() };
    saveCfg(cfg);
    if (!quitting && cfg.closeToTray !== false) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    const o = serverOrigin();
    if (url.startsWith('file://') || (o && url.startsWith(o))) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    log('falha ao abrir', url, code, desc);
    semConexao(tx('naoAbriu', { u: url, d: desc }));
  });
  // tela preta (v0.7.3): a página do servidor carregou mas a interface não apareceu (ou o processo da página caiu).
  // Confere alguns segundos depois de carregar; recarrega uma vez e, se continuar vazia, mostra "Sem conexão".
  win.webContents.on('did-finish-load', () => {
    clearTimeout(vigiaCarga);
    const url = win.webContents.getURL();
    if (!/^https?:/.test(url)) return;
    setTimeout(async () => {
      if (!win || win.webContents.getURL() !== url) return;
      const vazia = await win.webContents.executeJavaScript('!document.querySelector("#root")?.childElementCount', true).catch(() => true);
      if (!vazia) { recarregouVazia = 0; return; }
      log('a interface não apareceu depois de carregar', url);
      if (recarregouVazia++ < 1) win.webContents.reloadIgnoringCache(); else { recarregouVazia = 0; semConexao(tx('naoAbriu', { u: url, d: 'tela vazia' })); }
    }, 8000);
  });
  win.webContents.on('render-process-gone', (_e, d) => { log('a página caiu', d?.reason || ''); if (d?.reason !== 'clean-exit') setTimeout(() => openMain(), 500); });
  win.webContents.on('unresponsive', () => log('a página parou de responder'));
  win.webContents.on('page-title-updated', (e) => e.preventDefault());
  openMain();
}

let vigiaCarga = null;
let recarregouVazia = 0;
function semConexao(msg) { clearTimeout(vigiaCarga); win?.loadFile(path.join(here, 'conectar.html'), { query: { erro: msg } }); }
async function openMain() {
  if (!cfg.mode || !cfg.serverUrl) return win.loadFile(path.join(here, 'conectar.html'));
  // primeiro a tela local "Conectando ao Covil…" (aparece na hora) e uma pergunta rápida ao servidor; só então abre
  // o Covil. Antes, servidor lento ou fora do ar deixava a janela preta até o Windows desistir (v0.7.3).
  if (SERVIDOR && !/^file:/.test(win.webContents.getURL() || '') ) await win.loadFile(path.join(here, 'conectar.html')).catch(() => {});
  try {
    const r = await net.fetch(new URL('/api/info', cfg.serverUrl).toString(), { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) { log('o servidor não respondeu', e.message); return semConexao(tx('naoAbriu', { u: cfg.serverUrl, d: e.name === 'TimeoutError' ? 'sem resposta' : e.message })); }
  win.loadURL(cfg.pendingUrl || cfg.serverUrl);
  if (cfg.pendingUrl) { delete cfg.pendingUrl; saveCfg(cfg); }
  // servidor que não responde nem recusa (conexão pendurada): em vez de janela preta, "Sem conexão" em 20 s (v0.7.3)
  clearTimeout(vigiaCarga);
  vigiaCarga = setTimeout(() => { if (win && win.webContents.isLoadingMainFrame()) { log('o servidor não respondeu em 20 s'); win.webContents.stop(); semConexao(tx('naoAbriu', { u: cfg.serverUrl, d: 'sem resposta' })); } }, Number(process.env.COVIL_TEMPO_CARGA) || 20000);
}

function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

// Menu da bandeja no visual do Covil (v0.5.1): uma janelinha sem borda perto do relógio, no lugar do menu cinza
// do Windows. Cada item muda o #hash da página; o app ouve e faz a ação.
let menuBandeja = null;
function acaoDoMenu(acao) {
  menuBandeja?.hide();
  if (acao === 'abrir') showWindow();
  else if (acao === 'mutar') win?.webContents.send('covil:atalho', 'mute');
  else if (acao === 'surdo') win?.webContents.send('covil:atalho', 'deafen');
  else if (acao === 'sair') { quitting = true; app.quit(); }
}
function abrirMenuBandeja() {
  const textos = { abrir: tx('abrir'), mutar: tx('mutar'), surdo: tx('surdo'), sair: tx('sair'), v: VERSION };
  const L = 310; const A = 214;
  if (!menuBandeja || menuBandeja.isDestroyed()) {
    menuBandeja = new BrowserWindow({
      width: L, height: A, show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: true, backgroundColor: '#00000000', hasShadow: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
    menuBandeja.setMenu(null);
    menuBandeja.on('blur', () => menuBandeja?.hide());
    menuBandeja.webContents.on('did-navigate-in-page', (_e, url) => { const h = new URL(url).hash.slice(1); if (h) acaoDoMenu(h === 'fechar' ? '' : h); });
    menuBandeja.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    menuBandeja.webContents.on('will-navigate', (e) => e.preventDefault());
  }
  menuBandeja.loadFile(path.join(here, 'menu-bandeja.html'), { query: { t: JSON.stringify(textos) } });
  // perto do cursor, sem sair da área útil da tela (a barra de tarefas pode estar embaixo, em cima ou dos lados)
  const p = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(p).workArea;
  const x = Math.min(Math.max(area.x, p.x - L + 16), area.x + area.width - L);
  const y = p.y - A > area.y ? Math.min(p.y - A + 6, area.y + area.height - A) : Math.min(p.y, area.y + area.height - A);
  menuBandeja.setBounds({ x: Math.round(x), y: Math.round(y), width: L, height: A });
  menuBandeja.webContents.once('did-finish-load', () => { menuBandeja.show(); menuBandeja.focus(); });
}
function trayMenu() { /* textos do menu vêm na hora de abrir (idioma já trocado) */ }

function setupTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('Covil');
  tray.on('click', showWindow);
  tray.on('right-click', abrirMenuBandeja);
}

function setupMedia() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'display-capture', 'speaker-selection'].includes(perm) && trusted(wc)));
  ses.setPermissionCheckHandler((wc, perm) => ['media', 'notifications', 'clipboard-sanitized-write', 'speaker-selection'].includes(perm) && (!wc || trusted(wc)));
  // o seletor de tela é a janela do próprio Covil; aqui só entregamos a fonte escolhida
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const pick = pendingShare;
      pendingShare = null;
      if (!pick || !trustedUrl(request.frame?.url || request.securityOrigin || '')) return callback({});
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const src = sources.find((s) => s.id === pick.id);
      if (!src) return callback({});
      const out = { video: src };
      if (pick.audio && process.platform === 'win32') out.audio = 'loopback';
      callback(out);
    } catch (e) { log('tela', e.message); callback({}); }
  });
}

function setupIpc() {
  const guard = (fn) => async (e, ...a) => { if (!trusted(e.sender)) throw new Error('origem não autorizada'); return fn(...a); };
  ipcMain.handle('covil:info', () => ({ version: VERSION, isHost: false, platform: process.platform }));
  ipcMain.on('covil:info-sync', (e) => { e.returnValue = { version: VERSION, isHost: false, platform: process.platform, idioma: idioma(), servidorFixo: !!SERVIDOR }; });
  ipcMain.handle('covil:sources', guard(async () => {
    const s = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    return s.filter((x) => x.name !== 'Covil').map((x) => ({ id: x.id, name: x.name, thumbnail: x.thumbnail.toDataURL(), appIcon: x.appIcon?.isEmpty() === false ? x.appIcon.toDataURL() : null }));
  }));
  ipcMain.handle('covil:prepareShare', guard(async (pick) => { pendingShare = { id: String(pick.id), audio: !!pick.audio }; return true; }));
  // http(s) e só as páginas de rede das Configurações do Windows (para a pessoa trocar o perfil ela mesma)
  ipcMain.handle('covil:openExternal', async (_e, url) => { if (/^https?:\/\//.test(url) || /^ms-settings:network(-wifi|-ethernet|-status)?$/.test(url)) await shell.openExternal(url); });
  const pubCfg = () => ({ autoStart: app.getLoginItemSettings().openAtLogin, closeToTray: cfg.closeToTray !== false, isHost: false, servidorFixo: !!SERVIDOR, serverUrl: cfg.serverUrl || '', guiaVisto: !!cfg.guiaVisto, versaoVista: cfg.versaoVista || '', avisoDispensado: cfg.avisoDispensado || '', idioma: cfg.idioma || '' });
  ipcMain.handle('covil:getConfig', guard(async () => pubCfg()));
  ipcMain.handle('covil:setConfig', guard(async (p) => {
    if (p.autoStart !== undefined) app.setLoginItemSettings({ openAtLogin: !!p.autoStart, args: ['--escondido'] });
    if (p.closeToTray !== undefined) cfg.closeToTray = !!p.closeToTray;
    // tutorial e novidades (regra 12): o "já viu" do app fica no config.json
    if (p.guiaVisto !== undefined) cfg.guiaVisto = !!p.guiaVisto;
    if (p.versaoVista !== undefined) cfg.versaoVista = String(p.versaoVista).slice(0, 20);
    // aviso de versão nova (regra 14): o X esconde até sair uma mais nova
    if (p.avisoDispensado !== undefined) cfg.avisoDispensado = String(p.avisoDispensado).slice(0, 20);
    if (p.idioma !== undefined && ['pt', 'en', 'es'].includes(p.idioma)) { cfg.idioma = p.idioma; trayMenu(); }
    saveCfg(cfg);
    return pubCfg();
  }));
  ipcMain.handle('covil:changeServer', guard(async () => {
    if (SERVIDOR) return false; // o servidor do Covil é fixo
    cfg.mode = null;
    saveCfg(cfg);
    app.relaunch();
    quitting = true;
    app.quit();
  }));
  // tela de conexão (arquivo local)
  ipcMain.handle('covil:choose', async (e, choice) => {
    if (!e.sender.getURL().startsWith('file://')) throw new Error('não autorizado');
    if (SERVIDOR) return false;
    let u;
    try { u = new URL(/^https?:\/\//.test(choice.url) ? choice.url : `https://${choice.url}`); } catch { throw new Error(tx('endereco')); }
    try {
      const r = await net.fetch(`${u.origin}/api/info`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.name !== 'Covil') throw new Error();
    } catch { throw new Error(tx('naoAchei', { o: u.origin })); }
    const changedOrigin = cfg.serverUrl && new URL(cfg.serverUrl).origin !== u.origin;
    cfg.mode = 'client';
    cfg.serverUrl = u.origin;
    if (u.hash.includes('convite')) cfg.pendingUrl = u.toString();
    saveCfg(cfg);
    if (u.protocol === 'http:' && !/localhost|127\.0\.0\.1/.test(u.hostname) || changedOrigin) { app.relaunch(); quitting = true; app.quit(); return true; }
    saveCfg(cfg);
    openMain();
    return true;
  });
  // tela "sem conexão": tentar de novo
  ipcMain.handle('covil:reconectar', (e) => { if (!e.sender.getURL().startsWith('file://')) throw new Error('não autorizado'); openMain(); return true; });
  // atualização (regras 7, 14 e 15): confere os Releases do GitHub
  // (o botão "Procurar atualização" e a conferência da abertura vêm por aqui; o resultado fica guardado)
  ipcMain.handle('covil:checkUpdate', async () => conferirVersao());
  ipcMain.handle('covil:ultimaVersao', () => ultimaVersao);
  // "Atualizar": baixa o Covil-Setup, confere o SHA-256, fecha e instala (em silêncio se já estiver instalado)
  ipcMain.handle('covil:installUpdate', async (e, info) => {
    if (!info?.setup) { await shell.openExternal(info?.url || info?.download || `https://github.com/${REPO}/releases/latest`); return { modo: 'pagina' }; }
    const arq = await baixarSetup(info.setup, (p) => { try { e.sender.send('covil:progresso', p); } catch {} });
    log(`atualização: ${info.setup.name} baixado e conferido (SHA-256), instalando`);
    const r = aplicarSetup(arq, { sair: () => { quitting = true; app.quit(); } });
    return { modo: r.silencioso ? 'silencioso' : 'instalador' };
  });
}

// atalhos (v0.5.0): a tela manda a lista (ações e sons do soundboard); o app avisa quando a tecla desce e sobe
let atalhos = null;
function setupShortcuts() {
  atalhos = criarAtalhos((acao, fase) => win?.webContents.send('covil:atalho', `atalho:${acao}:${fase}`));
  // até a tela mandar a lista: os dois de sempre
  atalhos.definir(cfg.atalhos || { mutar: { code: 'KeyM', ctrl: true, shift: true }, ensurdecer: { code: 'KeyD', ctrl: true, shift: true } });
  // tempo sem mexer no PC (para o status "ausente" automático)
  ipcMain.handle('covil:idle', () => { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } });
  ipcMain.handle('covil:setAtalhos', (_e, lista) => {
    cfg.atalhos = lista && typeof lista === 'object' ? lista : {};
    saveCfg(cfg);
    return atalhos.definir(cfg.atalhos);
  });
}

// "Jogando agora" (v0.5.4): o app vê o jogo aberto e avisa a tela, que manda para o servidor
let vigiaJogos = null;
function setupJogos() {
  const jc = () => (cfg.jogos ||= { mostrar: true, registrados: [] });
  const ligar = () => {
    vigiaJogos?.parar();
    vigiaJogos = null;
    if (jc().mostrar === false) { win?.webContents.send('covil:jogo', null); return; }
    vigiaJogos = vigiarJogos({
      registrados: () => jc().registrados || [],
      // modo otimizado (v0.6.0): confere a cada 60 s em vez de 20 s
      intervaloMs: () => Number(process.env.COVIL_JOGOS_MS) || (cfg.otimizado ? 60000 : 20000),
      aoMudar: (nome, desde) => { log(nome ? `jogo aberto: ${nome}` : 'jogo fechado'); win?.webContents.send('covil:jogo', nome ? { nome, desde } : null); },
    });
  };
  // versões antigas do Covil espalhadas pelo PC (v0.5.9): lista, apaga só o que a lista achou, ou "não perguntar mais"
  let ultimosRestos = [];
  ipcMain.handle('covil:restos', async (e, acao, arg) => {
    if (!trusted(e.sender) || process.platform !== 'win32' && !process.env.COVIL_RESTOS_PASTAS) return { lista: [], dispensados: [] };
    const pastas = process.env.COVIL_RESTOS_PASTAS ? process.env.COVIL_RESTOS_PASTAS.split(path.delimiter) : [app.getPath('downloads'), app.getPath('desktop')];
    const listar = () => (ultimosRestos = acharCopiasAntigas({ pastas, conhecidas: cfg.portateis || [], atual: path.dirname(process.execPath) }));
    if (acao === 'listar') return { lista: listar(), dispensados: cfg.restosDispensados || [] };
    if (acao === 'apagar') {
      if (!ultimosRestos.length) listar();
      const r = apagarCopias(arg, ultimosRestos);
      cfg.portateis = (cfg.portateis || []).filter((d) => !r.apagados.some((a) => d.toLowerCase().startsWith(a.toLowerCase())));
      saveCfg(cfg);
      log(`limpeza: ${r.apagados.length} cópia(s) antiga(s) apagada(s), ${Math.round(r.bytes / 1048576)} MB${r.falhas.length ? `; ${r.falhas.length} falha(s)` : ''}`);
      return r;
    }
    if (acao === 'dispensar') { cfg.restosDispensados = [...new Set([...(cfg.restosDispensados || []), ...(arg || []).map(String)])].slice(-50); saveCfg(cfg); return { ok: true }; }
    return { lista: [], dispensados: [] };
  });

  ipcMain.handle('covil:jogos', async (_e, acao, arg) => {
    const c = jc();
    if (acao === 'estado') return { atual: vigiaJogos?.agora() || null, mostrar: c.mostrar !== false, registrados: c.registrados || [] };
    if (acao === 'programas') return programasComJanela();
    if (acao === 'registrar' && arg?.caminho) {
      const nome = String(arg.nome || '').trim().slice(0, 60) || path.basename(String(arg.caminho)).replace(/\.exe$/i, '');
      c.registrados = [...(c.registrados || []).filter((x) => x.caminho.toLowerCase() !== String(arg.caminho).toLowerCase()), { caminho: String(arg.caminho), nome }].slice(-100);
    }
    if (acao === 'remover') c.registrados = (c.registrados || []).filter((x) => x.caminho.toLowerCase() !== String(arg || '').toLowerCase());
    if (acao === 'mostrar') c.mostrar = !!arg;
    if (acao === 'otimizado') { if (cfg.otimizado === !!arg) return { ok: true }; cfg.otimizado = !!arg; saveCfg(cfg); log(`modo otimizado ${arg ? 'ligado' : 'desligado'}`); return { ok: true }; }
    saveCfg(cfg);
    if (acao === 'mostrar') ligar(); else vigiaJogos?.forcar();
    return { atual: vigiaJogos?.agora() || null, mostrar: c.mostrar !== false, registrados: c.registrados || [] };
  });
  ligar();
}

// Atualização automática e insistente (regra 14, revisada em 27/10 às 20h): confere os Releases ao abrir,
// a cada 30 min e quando a pessoa volta para a janela (no máximo uma vez a cada 10 min). Achou versão nova:
// a janela mostra o quadro na hora; escondida perto do relógio, notificação do Windows (uma por versão, ou
// a cada conferência se o Release for URGENTE). COVIL_TEMPOS_ATUALIZACAO="intervalo,foco" (ms) só para teste.
const [T_INTERVALO, T_FOCO] = (process.env.COVIL_TEMPOS_ATUALIZACAO || '').split(',').map(Number).map((n, i) => n > 0 ? n : [30 * 60_000, 10 * 60_000][i]);
let ultimaVersao = null;
let ultimaConferencia = 0;
async function conferirVersao() {
  ultimaConferencia = Date.now();
  ultimaVersao = await procurar(RELEASES, VERSION, idioma());
  return ultimaVersao;
}
async function autoCheck(motivo = 'tempo') {
  if (motivo === 'foco' && Date.now() - ultimaConferencia < T_FOCO) return;
  try {
    const info = await conferirVersao();
    if (!info?.newer) return;
    if (win?.isVisible()) { win.webContents.send('covil:atalho', 'novaVersao'); return; }
    if (info.urgente || info.latest !== cfg.notifiedVersion) {
      cfg.notifiedVersion = info.latest;
      saveCfg(cfg);
      const n = new Notification({ title: tx(info.urgente ? 'urgenteT' : 'novaT', { v: info.latest }), body: tx(info.urgente ? 'urgenteB' : 'novaB'), icon: iconPath });
      n.on('click', () => { showWindow(); win?.webContents.send('covil:atalho', 'novaVersao'); });
      n.show();
    }
  } catch {}
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { atalhos?.parar(); globalShortcut.unregisterAll(); });
async function rodarAutoteste() {
  const gravar = (o) => { try { fs.writeFileSync(AUTOTESTE, JSON.stringify(o, null, 2)); } catch {} };
  const limite = setTimeout(() => { gravar({ passou: false, erro: 'a janela não abriu em 60 s' }); app.exit(1); }, 60000);
  win.webContents.once('did-finish-load', async () => {
    clearTimeout(limite);
    const titulo = await win.webContents.executeJavaScript('document.querySelector(".brand")?.textContent || document.title').catch(() => '');
    gravar({ passou: /Covil/.test(titulo), versao: VERSION, exe: process.execPath, instalado: instalado(), userData, titulo });
    setTimeout(() => app.exit(0), 300);
  });
}
async function rodarAtualizarAgora() {
  const gravar = (o) => { try { fs.writeFileSync(ATUALIZAR_AGORA, JSON.stringify(o, null, 2)); } catch {} };
  try {
    const info = await procurar(RELEASES, VERSION, idioma());
    if (!info.newer || !info.setup) { gravar({ passou: false, erro: 'sem versão nova com Setup', info }); app.exit(1); return; }
    const arq = await baixarSetup(info.setup);
    gravar({ passou: true, versao: VERSION, nova: info.latest, arquivo: arq, sha256: await sha256Arquivo(arq), instalado: instalado() });
    log(`atualização (teste): ${info.setup.name} conferido, instalando em silêncio`);
    aplicarSetup(arq, { silencioso: true, sair: () => app.exit(0) });
  } catch (e) { gravar({ passou: false, erro: e.message }); app.exit(2); }
}

// v0.5.9: ao abrir, apaga os instaladores que o "Atualizar" já usou e lembra a pasta de cada cópia portátil que rodou
// (para oferecer apagar depois que o Covil passar a ser instalado)
function limparAoAbrir() {
  try {
    const r = limparInstaladores(pastaDownloads(), VERSION);
    if (r.apagados.length) log(`limpeza: ${r.apagados.length} instalador(es) antigo(s) apagado(s) (${Math.round(r.bytes / 1048576)} MB)`);
  } catch (e) { log('limpeza: ' + e.message); }
  if (process.platform === 'win32' && app.isPackaged && !instalado()) {
    const dir = path.dirname(process.execPath);
    const lista = cfg.portateis || [];
    if (!lista.some((d) => d.toLowerCase() === dir.toLowerCase())) { cfg.portateis = [...lista, dir].slice(-10); saveCfg(cfg); }
  }
}

// quem estava "abrir com o Windows" na cópia portátil continua assim depois de passar para o instalado
function ajustarInicioComWindows() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const s = app.getLoginItemSettings();
    const outro = (s.launchItems || []).some((i) => /covil/i.test(i.name || '') && String(i.path || '').toLowerCase() !== process.execPath.toLowerCase());
    if (!s.openAtLogin && outro) { app.setLoginItemSettings({ openAtLogin: true, args: ['--escondido'] }); log('abrir com o Windows: passou para este Covil'); }
  } catch {}
}

app.whenReady().then(() => {
  log(`Covil ${VERSION} abrindo (modo: ${cfg.mode || 'novo'})${instalado() ? ' [instalado]' : ''}`);
  if (process.argv.includes('--updated')) log(`aberto pelo instalador: atualizado para v${VERSION}`);
  if (ATUALIZAR_AGORA) { rodarAtualizarAgora(); return; }
  ajustarInicioComWindows();
  limparAoAbrir();
  setupMedia();
  setupIpc();
  createWindow();
  setupTray();
  setupShortcuts();
  setupJogos();
  if (AUTOTESTE) { rodarAutoteste(); return; }
  setTimeout(() => autoCheck('foco'), 15000); // a tela já confere ao abrir; isto cobre o Covil aberto escondido
  setInterval(() => autoCheck('tempo'), T_INTERVALO);
  win.on('focus', () => autoCheck('foco'));
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
