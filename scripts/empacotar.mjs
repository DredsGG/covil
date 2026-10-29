// Monta o app do Covil para Windows: pasta portátil com Covil.exe + zip. Desde a v0.7.0 é só o app (o servidor é o
// Covil Servidor); o endereço do servidor entra pela variável COVIL_SERVIDOR (segredo do repositório).
// Uso: COVIL_SERVIDOR=https://... node scripts/empacotar.mjs <electron-win32-x64.zip> <saida>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [electronZip, outBase] = process.argv.slice(2);
if (!electronZip || !outBase) { console.error('uso: COVIL_SERVIDOR=https://... node scripts/empacotar.mjs <electron.zip> <saida>'); process.exit(1); }
let servidor = '';
try { servidor = process.env.COVIL_SERVIDOR ? new URL(process.env.COVIL_SERVIDOR).origin : ''; } catch { throw new Error('COVIL_SERVIDOR inválido'); }
if (!servidor && !process.env.SEM_SERVIDOR) throw new Error('falta COVIL_SERVIDOR (o endereço do Covil Servidor)');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = path.resolve(outBase, 'Covil');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

console.log(`Covil v${version}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. Electron para Windows
run('unzip', ['-q', '-o', path.resolve(electronZip), '-d', out]);
fs.renameSync(path.join(out, 'electron.exe'), path.join(out, 'Covil.exe'));
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
for (const f of fs.readdirSync(path.join(out, 'locales'))) if (!['pt-BR.pak', 'en-US.pak', 'es.pak', 'es-419.pak'].includes(f)) fs.rmSync(path.join(out, 'locales', f));

// 2. o app (a tela vem do servidor; aqui ficam a janela, a bandeja, os atalhos e o seletor de tela)
const app = path.join(out, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
// todos os arquivos do app (sem lista fixa: a lista fixa já deixou arquivo novo de fora uma vez)
for (const f of fs.readdirSync(path.join(root, 'desktop')).filter((x) => /\.(mjs|cjs|html|svg|png)$/.test(x) && x !== 'icone-512.png')) fs.copyFileSync(path.join(root, 'desktop', f), path.join(app, f));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'));
pkg.version = version;
pkg.dependencies = { 'uiohook-napi': '1.5.5' };
if (servidor) pkg.covilServidor = servidor;
delete pkg.devDependencies;
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(pkg, null, 2));
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: app });
// uiohook (atalhos globais): só o binário do Windows x64 vai junto
const pre = path.join(app, 'node_modules', 'uiohook-napi', 'prebuilds');
if (fs.existsSync(pre)) for (const d of fs.readdirSync(pre)) if (d !== 'win32-x64') fs.rmSync(path.join(pre, d), { recursive: true, force: true });
if (!fs.existsSync(path.join(pre, 'win32-x64'))) throw new Error('uiohook-napi sem o binário do Windows');

// 3. ícone e versão no Covil.exe
const require = createRequire(path.join(root, 'desktop', 'package.json'));
const ResEdit = require('resedit');
const exePath = path.join(out, 'Covil.exe');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'desktop', 'icone.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groups[0]?.id ?? 1, groups[0]?.lang ?? 1033, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'Covil', ProductName: 'Covil', CompanyName: 'Dreds', LegalCopyright: 'André Miller Fleck (Dreds)',
  OriginalFilename: 'Covil.exe', InternalName: 'Covil', FileVersion: version, ProductVersion: version,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

// 4. leia-me e zip
fs.writeFileSync(path.join(out, 'LEIA-ME.txt'), [
  `Covil v${version} — chat, call e tela ao vivo da galera / chat, calls and live screens for your crew / chat, llamadas y pantallas en vivo para tu grupo`,
  '',
  '=== PORTUGUÊS ===',
  'COMO USAR',
  '1. Extraia esta pasta inteira onde quiser (ex.: Documentos\\Covil).',
  '2. Abra o Covil.exe.',
  '   Entre com a sua conta ou crie uma pelo link de convite que te mandaram.',
  '3. O Windows pode avisar "O Windows protegeu o computador" (o app não tem assinatura paga).',
  '   Clique em "Mais informações" e depois em "Executar assim mesmo".',
  'ATUALIZAR',
  'O Covil avisa sozinho quando sai versão nova. Baixe o zip novo e extraia por cima desta pasta',
  '(com o Covil fechado, inclusive perto do relógio). Contas, mensagens e arquivos ficam em %APPDATA%\\Covil.',
  'IDIOMA: PT · EN · ES no rodapé ou em Configurações → Idioma.',
  '',
  '=== ENGLISH ===',
  'HOW TO USE',
  '1. Extract this whole folder anywhere (e.g. Documents\\Covil).',
  '2. Open Covil.exe.',
  '   Log in with your account or create one with the invite link you got.',
  '3. Windows may say "Windows protected your PC" (the app has no paid signature).',
  '   Click "More info" and then "Run anyway".',
  'UPDATING',
  'Covil tells you by itself when a new version is out. Download the new zip and extract it over this folder',
  '(with Covil closed, including near the clock). Accounts, messages and files live in %APPDATA%\\Covil.',
  'LANGUAGE: PT · EN · ES in the footer or in Settings → Language.',
  '',
  '=== ESPAÑOL ===',
  'CÓMO USAR',
  '1. Extrae esta carpeta entera donde quieras (ej.: Documentos\\Covil).',
  '2. Abre Covil.exe.',
  '   Entra con tu cuenta o crea una con el enlace de invitación que te mandaron.',
  '3. Windows puede avisar "Windows protegió su PC" (la app no tiene firma paga).',
  '   Haz clic en "Más información" y luego en "Ejecutar de todas formas".',
  'ACTUALIZAR',
  'Covil avisa solo cuando sale una versión nueva. Descarga el zip nuevo y extráelo encima de esta carpeta',
  '(con Covil cerrado, también junto al reloj). Cuentas, mensajes y archivos quedan en %APPDATA%\\Covil.',
  'IDIOMA: PT · EN · ES en el pie o en Configuración → Idioma.',
  '',
  'feito por / made by / hecho por Dreds — https://github.com/DredsGG',
].join('\r\n'));
const zip = path.resolve(outBase, `Covil-v${version}-windows.zip`);
fs.rmSync(zip, { force: true });
run('zip', ['-q', '-r', '-9', zip, 'Covil'], { cwd: path.resolve(outBase) });
console.log('pronto:', zip, (fs.statSync(zip).size / 1e6).toFixed(1) + ' MB');
