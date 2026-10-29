// Limpeza das versões antigas (v0.5.9, pedido do André em 29/10: "sai antiga, entra nova, só fica ela").
// 1. Instaladores baixados pelo "Atualizar" (%TEMP%\Covil-atualizacao\Covil-Setup-X.Y.Z.exe): depois que a versão
//    nova abre, eles não servem para nada e são apagados sozinhos.
// 2. Cópias portáteis antigas (pastas "Covil-vX.Y.Z-windows", o zip delas e pastas portáteis em que o Covil já
//    rodou): o Covil acha, mostra a lista e só apaga com o "Apagar" da pessoa. Nunca mexe nos dados
//    (%APPDATA%\Covil) nem na pasta do Covil que está aberto.
import fs from 'node:fs';
import path from 'node:path';

const SETUP_RE = /^Covil-Setup-(\d+\.\d+\.\d+)\.exe(\.part)?$/i;
const PORTATIL_RE = /^Covil-v(\d+\.\d+\.\d+)-windows(\.zip)?$/i;

const num = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
const naoMaisNova = (a, b) => { const x = num(a); const y = num(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return true; };
const mesmoOuDentro = (filho, pai) => { const r = path.relative(path.resolve(pai), path.resolve(filho)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

function tamanho(p, limite = 20000) {
  let total = 0, n = 0;
  const andar = (q) => {
    if (++n > limite) return;
    let st; try { st = fs.lstatSync(q); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { let itens = []; try { itens = fs.readdirSync(q); } catch {} for (const i of itens) andar(path.join(q, i)); }
    else total += st.size;
  };
  andar(p);
  return total;
}

// 1. instaladores já usados: apaga os de versão igual ou anterior à que está aberta (e downloads pela metade)
export function limparInstaladores(pasta, versaoAtual) {
  const apagados = [];
  let bytes = 0;
  let itens = [];
  try { itens = fs.readdirSync(pasta); } catch { return { apagados, bytes }; }
  for (const nome of itens) {
    const m = SETUP_RE.exec(nome);
    if (!m) continue;
    if (!m[2] && !naoMaisNova(m[1], versaoAtual)) continue; // instalador de versão mais nova ainda pode servir
    const p = path.join(pasta, nome);
    try { bytes += fs.statSync(p).size; fs.rmSync(p, { force: true }); apagados.push(nome); } catch {}
  }
  try { if (!fs.readdirSync(pasta).length) fs.rmdirSync(pasta); } catch {}
  return { apagados, bytes };
}

// é uma pasta do Covil portátil? (Covil.exe com a pasta resources do Electron ao lado)
export function ehPortatil(dir) {
  try { return fs.existsSync(path.join(dir, 'Covil.exe')) && fs.existsSync(path.join(dir, 'resources')); } catch { return false; }
}

// 2. procura cópias antigas. pastas: onde procurar (Downloads, Área de Trabalho); conhecidas: pastas portáteis em
// que o Covil já rodou (guardadas na configuração); atual: a pasta do Covil aberto (nunca entra na lista).
export function acharCopiasAntigas({ pastas = [], conhecidas = [], atual = '' }) {
  const achadas = new Map();
  const add = (p, tipo, versao) => {
    const r = path.resolve(p);
    if (atual && (mesmoOuDentro(atual, r) || mesmoOuDentro(r, atual))) return; // a pasta aberta e as que a contêm, não
    if (!achadas.has(r.toLowerCase())) achadas.set(r.toLowerCase(), { caminho: r, tipo, versao: versao || '', bytes: tamanho(r) });
  };
  for (const base of pastas) {
    let itens = [];
    try { itens = fs.readdirSync(base); } catch { continue; }
    for (const nome of itens) {
      const m = PORTATIL_RE.exec(nome);
      if (!m) continue;
      const p = path.join(base, nome);
      if (m[2]) { try { if (fs.statSync(p).isFile()) add(p, 'zip', m[1]); } catch {} continue; }
      // pasta extraída: "Covil-vX-windows" com o Covil dentro (ou numa subpasta "Covil")
      if (ehPortatil(p) || ehPortatil(path.join(p, 'Covil'))) add(p, 'portatil', m[1]);
    }
  }
  for (const dir of conhecidas) {
    if (!dir || !ehPortatil(dir)) continue;
    // se a pasta está dentro de uma "Covil-vX-windows" que só tem ela, apaga a de fora inteira
    const pai = path.dirname(dir);
    let alvo = dir;
    try { if (PORTATIL_RE.test(path.basename(pai)) && fs.readdirSync(pai).length === 1) alvo = pai; } catch {}
    add(alvo, 'portatil', '');
  }
  return [...achadas.values()].sort((a, b) => a.caminho.localeCompare(b.caminho));
}

// apaga só o que a busca acabou de achar (a página não manda caminho qualquer)
export function apagarCopias(caminhos, achadas) {
  const ok = new Map(achadas.map((x) => [x.caminho.toLowerCase(), x]));
  const apagados = [], falhas = [];
  let bytes = 0;
  for (const c of caminhos || []) {
    const x = ok.get(path.resolve(String(c)).toLowerCase());
    if (!x) { falhas.push({ caminho: c, erro: 'não está na lista' }); continue; }
    try { fs.rmSync(x.caminho, { recursive: true, force: true, maxRetries: 2 }); apagados.push(x.caminho); bytes += x.bytes; }
    catch (e) { falhas.push({ caminho: x.caminho, erro: e.code === 'EBUSY' || e.code === 'EPERM' ? 'em uso (feche essa cópia do Covil)' : e.message }); }
  }
  return { apagados, falhas, bytes };
}
