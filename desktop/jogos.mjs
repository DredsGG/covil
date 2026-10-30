// "Jogando agora" (v0.5.4, pedido do André): o app olha os programas abertos a cada 20 s e diz qual jogo está
// rodando. Três jeitos, nesta ordem: jogos que a pessoa adicionou à mão, uma lista de executáveis conhecidos e a
// pasta onde o programa está (steamapps\common\<Jogo>, Epic Games\<Jogo>, Riot Games\<Jogo>...).
// Não sai nada do PC além do nome do jogo, e só se a pessoa deixar ligado.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// executável (minúsculo, sem .exe) → nome do jogo. ⚠️ Nomes de memória: o que não bater é pego pela pasta ou
// adicionado à mão em Configurações → Jogos.
export const CONHECIDOS = {
  'league of legends': 'League of Legends', 'valorant-win64-shipping': 'VALORANT', cs2: 'Counter-Strike 2', csgo: 'Counter-Strike: Global Offensive',
  'fortniteclient-win64-shipping': 'Fortnite', robloxplayerbeta: 'Roblox', 'minecraft.windows': 'Minecraft', javaw: null, gta5: 'Grand Theft Auto V', gta5_enhanced: 'Grand Theft Auto V',
  rocketleague: 'Rocket League', r5apex: 'Apex Legends', r5apex_dx12: 'Apex Legends', overwatch: 'Overwatch 2', dota2: 'Dota 2', genshinimpact: 'Genshin Impact', yuanshen: 'Genshin Impact',
  starrail: 'Honkai: Star Rail', zenlesszonezero: 'Zenless Zone Zero', rainbowsix: 'Rainbow Six Siege', rainbowsix_vulkan: 'Rainbow Six Siege', tslgame: 'PUBG: BATTLEGROUNDS',
  eldenring: 'ELDEN RING', rustclient: 'Rust', 'deadbydaylight-win64-shipping': 'Dead by Daylight', 'marvel-win64-shipping': 'Marvel Rivals', fallguys_client_game: 'Fall Guys',
  'among us': 'Among Us', terraria: 'Terraria', 'stardew valley': 'Stardew Valley', 'osu!': 'osu!', bg3: "Baldur's Gate 3", bg3_dx11: "Baldur's Gate 3", cyberpunk2077: 'Cyberpunk 2077',
  rdr2: 'Red Dead Redemption 2', 'palworld-win64-shipping': 'Palworld', helldivers2: 'HELLDIVERS 2', cod: 'Call of Duty', 'cod24-cod': 'Call of Duty', wow: 'World of Warcraft',
  hearthstone: 'Hearthstone', 'diablo iv': 'Diablo IV', pathofexile_x64: 'Path of Exile', pathofexilesteam: 'Path of Exile', pathofexile_x64steam: 'Path of Exile',
  warframe: 'Warframe', 'warframe.x64': 'Warframe', destiny2: 'Destiny 2', escapefromtarkov: 'Escape from Tarkov', sotgame: 'Sea of Thieves', phasmophobia: 'Phasmophobia',
  brawlhalla: 'Brawlhalla', 'lethal company': 'Lethal Company', deadlock: 'Deadlock', project8: 'Deadlock', fc25: 'EA SPORTS FC 25', fc26: 'EA SPORTS FC 26',
  'hollow knight': 'Hollow Knight', 'hollow knight silksong': 'Hollow Knight: Silksong', 'the finals': 'THE FINALS', discovery: 'THE FINALS', 'onimusha': 'Onimusha',
};
// o que não é jogo (lojas, atualizadores, antitrapaça...) mesmo estando na pasta de um jogo
const NAO_JOGO = /^(steam|steamwebhelper|steamservice|epicgameslauncher|epicwebhelper|riotclient\w*|riot client|leagueclient\w*|battle\.net|agent|eadesktop|eabackgroundservice|origin\w*|upc|ubisoftconnect|uplaywebcore|galaxyclient\w*|gogalaxy\w*|xboxapp\w*|gamebar\w*|overwolf\w*|vgtray|vgc|easyanticheat\w*|beservice\w*|start_protected_game|crashreport\w*|unitycrashhandler\w*|\w*crash\w*|\w*launcher\w*|\w*updater\w*|\w*setup\w*|\w*install\w*|unins\d*|vc_redist\w*|dxsetup|\w*helper\w*|cefsharp\.browsersubprocess|qtwebengineprocess|\w*overlay\w*|eos\w*|epiconlineservices\w*|gameoverlayui\w*|steamerrorreporter\w*|wallpaper\d*|webwallpaper\d*|ui32)$/i;
const PASTAS = [
  /\\steamapps\\common\\([^\\]+)\\/i, /\\Epic Games\\([^\\]+)\\/i, /\\Riot Games\\([^\\]+)\\/i, /\\XboxGames\\([^\\]+)\\/i,
  /\\GOG Games\\([^\\]+)\\/i, /\\Ubisoft Game Launcher\\games\\([^\\]+)\\/i, /\\EA Games\\([^\\]+)\\/i, /\\Battle\.net\\([^\\]+)\\/i,
  // Linux (só para os testes)
  /\/steamapps\/common\/([^/]+)\//i,
];
// v0.7.3: "Epic Online Services" (sobreposição da Epic que roda junto com vários jogos, inclusive da Steam) aparecia
// como jogo; o mesmo valia para outras pastas de serviço/ferramenta que ficam abertas sem ser jogo
const PASTA_NAO_JOGO = /^(riot client|launcher|steamworks shared|steamvr|vrchat\s*launcher|epic online services|directxredist|steam controller configs|steam linux runtime.*|proton.*|wallpaper_engine|ubisoft connect|battle\.net)$/i;
const exe = (n) => String(n || '').toLowerCase().replace(/\.exe$/, '');

// processos: [{ nome, caminho, titulo }]; registrados: [{ caminho, nome }]
export function detectarJogo(processos, registrados = []) {
  for (const r of registrados) {
    const alvo = String(r.caminho || '').toLowerCase();
    if (alvo && processos.some((p) => String(p.caminho || '').toLowerCase() === alvo)) return r.nome;
  }
  for (const p of processos) { const n = CONHECIDOS[exe(p.nome)]; if (n) return n; }
  // pela pasta: primeiro os programas com janela (o jogo tem janela; serviço e sobreposição não), depois o resto
  const pelaPasta = (p) => {
    if (!p.caminho || NAO_JOGO.test(exe(p.nome))) return null;
    for (const re of PASTAS) {
      const m = re.exec(p.caminho);
      if (m && !PASTA_NAO_JOGO.test(m[1].trim())) return m[1].trim();
    }
    return null;
  };
  for (const p of processos) { if (p.titulo) { const n = pelaPasta(p); if (n) return n; } }
  for (const p of processos) { if (!p.titulo) { const n = pelaPasta(p); if (n) return n; } }
  return null;
}

// programas abertos agora
export function listarProcessos() {
  if (process.platform === 'win32') {
    const ps = "Get-Process | Where-Object { $_.Path } | Select-Object @{n='nome';e={$_.ProcessName}}, @{n='caminho';e={$_.Path}}, @{n='titulo';e={$_.MainWindowTitle}} | ConvertTo-Json -Compress";
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        try { const j = JSON.parse(out || '[]'); resolve((Array.isArray(j) ? j : [j]).filter(Boolean)); } catch { resolve([]); }
      });
    });
  }
  // Linux/macOS: /proc (para os testes no Linux)
  const lista = [];
  try {
    for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
      try {
        const nome = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        let caminho = '';
        try { caminho = fs.readlinkSync(`/proc/${pid}/exe`); } catch {}
        lista.push({ nome, caminho, titulo: '' });
      } catch {}
    }
  } catch {}
  return Promise.resolve(lista);
}

// programas com janela (para "Adicionar jogo"): sem os do sistema e sem repetidos
export async function programasComJanela() {
  const todos = await listarProcessos();
  const vistos = new Set();
  return todos.filter((p) => (process.platform !== 'win32' || p.titulo) && p.caminho && !/\\Windows\\|\\WindowsApps\\Microsoft\.|\\Microsoft\\Edge|\\Covil\\/i.test(p.caminho))
    .filter((p) => { const k = p.caminho.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((p) => ({ caminho: p.caminho, nome: p.titulo || path.basename(p.caminho).replace(/\.exe$/i, ''), exe: path.basename(p.caminho) }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .slice(0, 80);
}

// vigia: chama aoMudar(nome|null, desde) quando o jogo aberto muda
export function vigiarJogos({ registrados, intervaloMs = 20000, aoMudar, listar = listarProcessos }) {
  let atual = null;
  let desde = 0;
  let parado = false;
  let tm = null;
  const rodada = async () => {
    if (parado) return;
    try {
      const nome = detectarJogo(await listar(), registrados());
      if (nome !== atual) { atual = nome; desde = nome ? Date.now() : 0; aoMudar(atual, desde); }
    } catch {}
    if (!parado) tm = setTimeout(rodada, typeof intervaloMs === 'function' ? intervaloMs() : intervaloMs);
  };
  tm = setTimeout(rodada, 1500);
  return { parar() { parado = true; clearTimeout(tm); }, agora: () => (atual ? { nome: atual, desde } : null), forcar: () => { clearTimeout(tm); rodada(); } };
}
