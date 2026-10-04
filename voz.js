/* =====================================================================
   SOLVEX · Asistente de voz con IA  (v1.4.0)
   - Botón flotante + panel de voz (web: Web Speech API · APK: SpeechRecognizer nativo)
   - Motor local en español: reparte lo dictado en cada caja y lo deja ordenado
   - Búsqueda en internet (IA Claude con búsqueda web; respaldo OpenStreetMap)
   Depende de las globales de index.html: state, saveState, render, sync*, toast, uid...
   ===================================================================== */
(function () {
"use strict";
if (window.__solvexVozCargado) return;
window.__solvexVozCargado = true;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ===================== 1. Utilidades de texto ===================== */
/* Normaliza (minúsculas, sin acentos) conservando la MISMA longitud para poder cortar el texto original. */
function norm(s) {
  s = String(s == null ? "" : s);
  let o = "";
  for (let i = 0; i < s.length; i++) { const d = s[i].normalize("NFD"); o += d[0].toLowerCase(); }
  return o.length === s.length ? o : s.toLowerCase();
}
const colapsar = s => String(s).replace(/\s+/g, " ").trim();
const PARTICULAS = new Set(["de", "del", "y", "e", "en", "con", "para", "por", "a", "al"]);
const SIGLAS = { eds: "EDS", gnv: "GNV", gnc: "GNC", glp: "GLP", pca: "PCA", prt: "PRT", sas: "S.A.S.", ltda: "Ltda.", sa: "S.A.", cia: "Cía.", ese: "E.S.E.", nit: "NIT", cc: "C.C." };
function titulo(s) {
  let t = colapsar(s)
    .replace(/\bs\.?\s*a\.?\s*s\.?(?=\s|$|[,.;])/gi, "S.A.S.")
    .replace(/\bltda\.?(?=\s|$|[,.;])/gi, "Ltda.");
  return t.split(" ").map((w, i) => {
    if (!w) return w;
    if (/\d/.test(w)) return /^[#\d.,\-\/]+[a-z]?$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    const base = norm(w).replace(/[.,;:]+$/g, "");
    if (SIGLAS[base] && !/^S\.A\.S\.|^Ltda\./.test(w)) return SIGLAS[base] + (/[,;:]$/.test(w) ? w.slice(-1) : "");
    if (/^S\.A\.S\.|^Ltda\./.test(w)) return w;
    if (w === w.toUpperCase() && w.length <= 4 && /[A-ZÁÉÍÓÚÑ]/.test(w)) return w;
    if (/[A-ZÁÉÍÓÚÑ]/.test(w.slice(1))) return w;
    if (i > 0 && PARTICULAS.has(base)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}
function oracion(s) {
  let t = colapsar(s);
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : t + ".";
}
function frase(s) { const t = colapsar(s); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

/* ===================== 2. Números en español ===================== */
const NU = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const ND = { veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const NC = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* Lee un número a partir de tokens[i]. Devuelve {v, n} o null. "tres cero cero" => 3 (n=1), no 300. */
function leerNumero(tk, i) {
  let j = i, total = 0, grupo = 0, hay = false, fase = 0; // 0 inicio, 1 tras centena, 2 tras decena, 3 tras unidad
  while (j < tk.length) {
    const w = tk[j];
    if (/^\d+(\.\d+)?$/.test(w)) { if (hay) break; return { v: parseFloat(w), n: 1 }; }
    if (has(NC, w) && fase === 0) { grupo += NC[w]; fase = 1; hay = true; j++; continue; }
    if (has(ND, w) && fase <= 1) { grupo += ND[w]; fase = 2; hay = true; j++; continue; }
    if (w === "y" && fase === 2 && has(NU, tk[j + 1]) && NU[tk[j + 1]] >= 1 && NU[tk[j + 1]] <= 9) { grupo += NU[tk[j + 1]]; fase = 3; hay = true; j += 2; continue; }
    if (has(NU, w) && (fase === 0 || fase === 1)) { if (fase === 1 && NU[w] === 0) break; grupo += NU[w]; fase = 3; hay = true; j++; continue; }
    if (w === "mil" && (hay || j === i)) { total += (grupo || 1) * 1000; grupo = 0; fase = 0; hay = true; j++; continue; }
    if ((w === "millon" || w === "millones") && (hay || j === i)) { total += (grupo || 1) * 1e6; grupo = 0; fase = 0; hay = true; j++; continue; }
    break;
  }
  return hay ? { v: total + grupo, n: j - i } : null;
}
function tokens(s) {
  const n = norm(s), out = [], re = /[a-z]+|\d+(?:[.,]\d+)*/g; let m;
  while ((m = re.exec(n))) {
    let w = m[0];
    if (/^\d/.test(w)) w = /^\d{1,3}([.,]\d{3})+$/.test(w) ? w.replace(/[.,]/g, "") : w.replace(",", ".");
    out.push({ w, i: m.index, j: m.index + m[0].length });
  }
  return out;
}
function primerNumero(s) {
  const tk = tokens(s), ws = tk.map(t => t.w);
  for (let i = 0; i < ws.length; i++) { const r = leerNumero(ws, i); if (r) return r.v; }
  return null;
}
/* Dígitos de un valor dictado: "tres cero cero doce 45 sesenta y siete" => 300124567 */
function extraerDigitos(s) {
  const ws = tokens(s).map(t => t.w); let out = "", i = 0;
  while (i < ws.length) {
    const w = ws[i];
    if ((w === "doble" || w === "triple") && i + 1 < ws.length) { const r = leerNumero(ws, i + 1); if (r && r.v < 10) { out += String(r.v).repeat(w === "doble" ? 2 : 3); i += 1 + r.n; continue; } }
    if (/^\d+(\.\d+)?$/.test(w)) { out += w.replace(".", ""); i++; continue; }
    const r = leerNumero(ws, i);
    if (r) { out += String(r.v); i += r.n; } else i++;
  }
  return out;
}
/* Reemplaza números dichos con palabras por dígitos dentro de un texto (direcciones). */
function numerosEnTexto(s) {
  const tk = tokens(s), ws = tk.map(t => t.w); let out = "", last = 0, i = 0;
  while (i < ws.length) {
    const r = leerNumero(ws, i);
    if (r && !/^\d/.test(ws[i]) ) { out += s.slice(last, tk[i].i) + String(r.v); last = tk[i + r.n - 1].j; i += r.n; } else i++;
  }
  return out + s.slice(last);
}
const RUNW = "(?:" + [].concat(Object.keys(NU), Object.keys(ND), Object.keys(NC), ["mil", "millones", "millon"]).sort((a, b) => b.length - a.length).join("|") + ")";
const RUN = "(?:\\d+(?:[.,]\\d+)?|" + RUNW + "(?:\\s+(?:y\\s+)?" + RUNW + ")*)";

/* ===================== 3. Formatos ===================== */
const miles = d => String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
function dvNit(d) {
  const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71], r = String(d).split("").reverse();
  let s = 0; for (let i = 0; i < r.length && i < 15; i++) s += Number(r[i]) * w[i];
  const m = s % 11; return m > 1 ? 11 - m : m;
}
/* NIT: devuelve {valor, aviso}. Agrega el dígito de verificación si falta y lo valida si se dictó. */
function formatoNit(raw) {
  const n = norm(raw);
  const partes = n.split(/\s*(?:guion|raya|digito de verificacion|digito verificador|dv)\s*|\s*-\s*/);
  let base = extraerDigitos(partes[0]), dvTxt = partes[1] ? extraerDigitos(partes.slice(1).join(" ")) : "";
  if (!base) return { valor: "", aviso: "No entendí el NIT" };
  if (!dvTxt && base.length === 10 && dvNit(base.slice(0, 9)) === Number(base[9])) { dvTxt = base[9]; base = base.slice(0, 9); }
  if (base.length < 5 || base.length > 10) return { valor: "", aviso: `NIT con ${base.length} dígitos: revise (${base})` };
  const dv = dvNit(base); let aviso = "";
  if (dvTxt && Number(dvTxt) !== dv) aviso = `El dígito de verificación dictado (${dvTxt}) no coincide con el calculado (${dv}). Se usó ${dv}; verifique el NIT.`;
  return { valor: `${miles(base)}-${dv}`, aviso };
}
function formatoTel(raw) {
  let d = extraerDigitos(raw);
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (d.length === 10 && d[0] === "3") return { valor: `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`, aviso: "" };
  if (d.length === 10 && d.startsWith("60")) return { valor: `(${d.slice(0, 3)}) ${d.slice(3, 6)} ${d.slice(6)}`, aviso: "" };
  if (d.length === 7) return { valor: `${d.slice(0, 3)} ${d.slice(3)}`, aviso: "" };
  if (d.length === 8 && d[0] !== "0") return { valor: `${d.slice(0, 4)} ${d.slice(4)}`, aviso: "" };
  if (!d) return { valor: "", aviso: "No entendí el teléfono" };
  return { valor: d, aviso: `Teléfono con ${d.length} dígitos: revise (${d})` };
}
function formatoCelular(raw) {
  let d = extraerDigitos(raw);
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (!d) return { valor: "", aviso: "No entendí el número de WhatsApp" };
  return { valor: d, aviso: d.length === 10 && d[0] === "3" ? "" : `WhatsApp con ${d.length} dígitos (se esperan 10, ej. 3001234567): revise` };
}
const DOMINIOS = ["gmail", "hotmail", "outlook", "yahoo", "icloud", "live"];
function formatoCorreo(raw) {
  let t = " " + norm(raw).replace(/[,;]/g, " ") + " ";
  t = t.replace(/\s+arroba\s+/g, "@").replace(/\s+(?:guion bajo|barra baja|underscore)\s+/g, "_").replace(/\s+(?:guion medio|guion)\s+/g, "-").replace(/\s+punto\s+/g, ".").replace(/\s+at\s+/g, "@");
  t = t.replace(/\s+/g, "");
  if (t.indexOf("@") < 0) { const m = t.match(new RegExp("^(.+?)(" + DOMINIOS.join("|") + ")\\.?(com\\.co|com|co|net|org)?$")); if (m) t = m[1] + "@" + m[2] + "." + (m[3] || "com"); }
  const ok = /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/.test(t);
  return { valor: t, aviso: ok ? "" : "El correo no parece válido: revise " + t };
}
const CIUDADES = ["Bogotá", "Soacha", "Zipaquirá", "Chía", "Cajicá", "Facatativá", "Fusagasugá", "Girardot", "Mosquera", "Madrid", "Funza", "Tocancipá", "Sopó", "La Calera", "Cota", "Tenjo", "Tabio", "Gachancipá", "Ubaté", "Villeta", "Sesquilé", "Guatavita", "Nemocón", "Cogua", "Briceño", "Tausa", "Sibaté", "Silvania", "Anapoima", "La Mesa", "Tocaima", "Ricaurte", "Cáqueza", "Choachí", "Guasca", "Chocontá", "Villapinzón", "Lenguazaque", "Fúquene", "Simijaca", "Chiquinquirá", "Tunja", "Duitama", "Sogamoso", "Paipa", "Villa de Leyva", "Samacá", "Ráquira", "Moniquirá", "Garagoa", "Puerto Boyacá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga", "Cúcuta", "Pereira", "Manizales", "Armenia", "Ibagué", "Neiva", "Villavicencio", "Pasto", "Santa Marta", "Montería", "Valledupar", "Popayán", "Sincelejo", "Yopal", "Cundinamarca", "Boyacá", "Antioquia", "Santander", "Tolima", "Meta", "Huila", "Valle del Cauca", "Atlántico"];
const MAPA_CIUDADES = {}; CIUDADES.forEach(c => { MAPA_CIUDADES[norm(c)] = c; });
function formatoLugar(raw) {
  const partes = String(raw).split(/\s*,\s*/).map(p => colapsar(p)).filter(Boolean);
  return partes.map(p => MAPA_CIUDADES[norm(p)] || titulo(p)).join(", ");
}
function formatoDireccion(raw) {
  let t = numerosEnTexto(colapsar(raw));
  t = t.replace(/\b(?:n[uú]mero|nro\.?|no\.?)\s*(?=\d)/gi, "# ").replace(/#\s*/g, "# ");
  t = t.replace(/(\d+[A-Za-z]?)\s*(?:guion|gui[oó]n|-)\s*(\d+)/gi, "$1-$2");
  t = t.replace(/\b(?:cra|kra|kr|cr)\b\.?/gi, "Carrera").replace(/\b(?:cll|cl)\b\.?/gi, "Calle").replace(/\b(?:av|avda)\b\.?/gi, "Avenida").replace(/\b(?:diag)\b\.?/gi, "Diagonal").replace(/\b(?:trans|tv)\b\.?/gi, "Transversal");
  t = t.replace(/\b(?:apto|apartamento)\b\.?/gi, "Apto.").replace(/\bbis\b/gi, "Bis");
  return titulo(t).replace(/\s*#\s*/g, " # ").replace(/\s+/g, " ").trim();
}
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const pad2 = n => String(n).padStart(2, "0");
function formatoFecha(raw) {
  const n = norm(raw).trim(), hoy = new Date(), iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return { valor: n, aviso: "" };
  if (/\bhoy\b/.test(n)) return { valor: iso(hoy), aviso: "" };
  if (/\bma[nñ]ana\b/.test(n)) { const d = new Date(hoy.getTime() + 864e5); return { valor: iso(d), aviso: "" }; }
  if (/\bayer\b/.test(n)) { const d = new Date(hoy.getTime() - 864e5); return { valor: iso(d), aviso: "" }; }
  const mes = Object.keys(MESES).find(m => n.includes(m));
  if (mes) {
    const antes = n.slice(0, n.indexOf(mes)), despues = n.slice(n.indexOf(mes) + mes.length);
    const dia = primerNumero(antes), anio = primerNumero(despues);
    if (dia >= 1 && dia <= 31) return { valor: `${anio && anio > 1999 ? anio : hoy.getFullYear()}-${pad2(MESES[mes])}-${pad2(dia)}`, aviso: "" };
  }
  const m = n.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return { valor: `${a}-${pad2(m[2])}-${pad2(m[1])}`, aviso: "" }; }
  return { valor: "", aviso: "No entendí la fecha" };
}
function formatoNumeroCot(raw) {
  const t = colapsar(norm(raw).replace(/\b(guion|raya)\b/g, "-")).replace(/\s*-\s*/g, "-").replace(/\s+/g, "-").toUpperCase();
  return { valor: t.replace(/[^A-Z0-9\-]/g, "").slice(0, 40), aviso: "" };
}

/* ===================== 4. Campos del formato ===================== */
/* c = clave; meta = propiedad de state.meta; id = caja de texto; et = etiqueta; f = formateador */
const CAMPOS = {
  numero:   { meta: "numero",   id: "mNumero",    et: "N.º de cotización", f: formatoNumeroCot },
  fecha:    { meta: "fecha",    id: "mFecha",     et: "Fecha",             f: formatoFecha },
  cliente:  { meta: "cliente",  id: "mCliente",   et: "Cliente",           f: v => ({ valor: titulo(v), aviso: "" }) },
  nit:      { meta: "nit",      id: "mNit",       et: "NIT / RUT",         f: formatoNit },
  eds:      { meta: "eds",      id: "mEds",       et: "Estación (EDS)",    f: v => ({ valor: titulo(v), aviso: "" }) },
  ciudad:   { meta: "ciudad",   id: "mCiudad",    et: "Ciudad",            f: v => ({ valor: formatoLugar(v), aviso: "" }) },
  direccion:{ meta: "direccion",id: "mDireccion", et: "Dirección",         f: v => ({ valor: formatoDireccion(v), aviso: "" }) },
  telefono: { meta: "telefono", id: "mTelefono",  et: "Teléfono",          f: formatoTel },
  correo:   { meta: "correo",   id: "mCorreo",    et: "Correo",            f: formatoCorreo },
  contacto: { meta: "contacto", id: "mContacto",  et: "Contacto",          f: v => ({ valor: titulo(v), aviso: "" }) },
  whatsapp: { meta: "whatsapp", id: "mWhatsApp",  et: "WhatsApp",          f: formatoCelular },
  tecnico:  { meta: "tecnico",  id: "mTecnico",   et: "Técnico",           f: v => ({ valor: titulo(v), aviso: "" }) },
  cargo:    { meta: "cargo",    id: "mCargo",     et: "Cargo",             f: v => ({ valor: frase(v), aviso: "" }) },
  docFirma: { meta: "docFirma", id: "mDocFirma",  et: "C.C. del firmante", f: v => { const d = extraerDigitos(v); return { valor: d ? miles(d) : "", aviso: d ? "" : "No entendí el documento" }; } },
  notas:    { meta: "notas",    id: "mNotas",     et: "Observaciones",     f: v => ({ valor: oracion(v), aviso: "" }), anexar: true }
};
const ORDEN = ["numero", "fecha", "cliente", "nit", "eds", "ciudad", "direccion", "telefono", "correo", "contacto", "whatsapp", "tecnico", "cargo", "docFirma", "notas"];

/* Frases que activan cada campo (normalizadas). Incluye confusiones típicas del reconocedor de voz. */
const MARCAS = [
  ["numero",   ["numero de cotizacion", "numero de la cotizacion", "cotizacion numero", "consecutivo"]],
  ["fecha",    ["fecha de la cotizacion", "fecha"]],
  ["cliente",  ["nombre del cliente", "razon social", "cliente", "empresa", "propietario", "compania"]],
  ["nit",      ["numero de identificacion tributaria", "identificacion tributaria", "nit", "nid", "need", "nic", "nick", "nitt", "n i t", "ni t", "ene i te", "rut", "root", "rud"]],
  ["eds",      ["nombre de la estacion", "estacion de servicio", "estacion", "eds", "e d s", "gasolinera", "bomba"]],
  ["ciudad",   ["ciudad", "municipio", "poblacion"]],
  ["direccion",["direccion", "ubicacion", "ubicada en", "queda en"]],
  ["telefono", ["telefono fijo", "telefono", "fijo", "pbx"]],
  ["whatsapp", ["whatsapp", "what s app", "wasap", "guasap", "whatsap", "wassap", "watsap", "celular", "movil", "cel"]],
  ["correo",   ["correo electronico", "correo", "e mail", "email", "mail"]],
  ["contacto", ["persona de contacto", "contacto", "administrador", "administradora", "encargado", "encargada", "atiende", "gerente"]],
  ["tecnico",  ["tecnico responsable", "tecnico", "elaboro", "elabora", "firmante"]],
  ["cargo",    ["cargo del firmante", "cargo"]],
  ["docFirma", ["cedula del firmante", "documento del firmante", "cedula", "c c"]],
  ["notas",    ["observaciones", "observacion", "notas", "nota"]],
  ["destino",  ["lugar de la visita", "desplazamiento a", "visita a", "viaje a", "destino", "vamos a", "voy a"]]
];
const NOMBRE_MARCA = {}; const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TODAS_FRASES = [];
MARCAS.forEach(([c, fs]) => fs.forEach(f => { NOMBRE_MARCA[f] = c; TODAS_FRASES.push(f); }));
TODAS_FRASES.sort((a, b) => b.length - a.length);
const ALT_MARCAS = TODAS_FRASES.map(f => escRe(f).replace(/ /g, "\\s+")).join("|");
const RE_MARCA = () => new RegExp("(?<![a-z0-9])(" + ALT_MARCAS + ")(?![a-z0-9])", "g");
const claveMarca = txt => NOMBRE_MARCA[colapsar(txt)] || NOMBRE_MARCA[txt.replace(/\s+/g, " ")];

/* ===================== 5. Analizador local (NLU) ===================== */
const RE_OBJ = {
  nit: /\b(?:nit|nid|need|nic|nick|nitt|rut|root|rud|identificacion tributaria)\b/g,
  telefono: /\b(?:telefonos?|fijo|pbx|numero de telefono|numero de contacto|numero de la estacion)\b/g,
  celular: /\b(?:celular|movil|whatsapp|wasap|guasap|whatsap|wassap|watsap)\b/g,
  direccion: /\b(?:direccion|ubicacion|donde queda|donde esta)\b/g,
  correo: /\b(?:correo|email|e mail|mail)\b/g,
  razon: /\b(?:razon social|nombre legal|representante legal)\b/g,
  todo: /\b(?:datos|informacion|todo|perfil|contacto)\b/g
};
function limpiarEntidad(seg) {
  const n = norm(seg), spans = [];
  const quitar = [/\b(?:en|por)\s+(?:internet|google|la\s+web|la\s+red|linea)\b/g, /\b(?:por\s+favor|porfa|pues|entonces|ok|listo)\b/g].concat(Object.values(RE_OBJ));
  quitar.forEach(re => { re.lastIndex = 0; let m; while ((m = re.exec(n))) { spans.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; } });
  spans.sort((a, b) => a[0] - b[0]);
  let out = "", p = 0; spans.forEach(([i, j]) => { if (i >= p) { out += seg.slice(p, i) + " "; p = j; } else if (j > p) p = j; });
  out = colapsar(out + seg.slice(p)).replace(/[¦,;:.]+/g, " ");
  out = colapsar(out);
  for (let k = 0; k < 6; k++) { const m = norm(out).match(/^(?:y|e|el|la|los|las|un|una|de|del|para|sobre|acerca|me|mi|su|sus|lo|que)\s+/); if (!m) break; out = out.slice(m[0].length); }
  return colapsar(out);
}

function analizarLocal(texto, ctx) {
  ctx = ctx || {};
  let T = String(texto).replace(/\s+/g, " ").trim(), N = norm(T);
  const plan = { campos: {}, horas: null, horasAdic: null, items: {}, viaje: {}, descuento: null, busqueda: null, comandos: [], borrar: [], residuo: "", pendiente: null, motor: "local" };
  const blank = (i, l) => { const f = "¦".repeat(l); T = T.slice(0, i) + f + T.slice(i + l); N = N.slice(0, i) + f + N.slice(i + l); };
  function consumir(re, cb) {
    re.lastIndex = 0; const sp = []; let m;
    while ((m = re.exec(N))) { if (!m[0].length) { re.lastIndex++; continue; } sp.push({ i: m.index, l: m[0].length, m }); }
    sp.forEach(s => cb(s.m, T.substr(s.i, s.l)));
    sp.forEach(s => blank(s.i, s.l));
    return sp.length;
  }
  const num = s => primerNumero(s);

  /* --- Comandos --- */
  consumir(/\b(?:borra|borrar|limpia|limpiar|elimina|eliminar|quita|quitar)\s+(?:la\s+)?firma\b/g, () => plan.comandos.push("borrarFirma"));
  consumir(new RegExp("\\b(?:borra|borrar|limpia|limpiar|elimina|eliminar|quita|quitar|vacia|vaciar)\\s+(?:el|la|los|las)?\\s*(?:campo\\s+(?:de\\s+)?)?(" + ALT_MARCAS + ")(?![a-z0-9])", "g"), m => { const c = claveMarca(m[1]); if (c && CAMPOS[c] && plan.borrar.indexOf(c) < 0) plan.borrar.push(c); });
  consumir(/\b(?:deshaz|deshacer|deshaga|revierte|revertir|anula\s+lo\s+ultimo|cancela\s+lo\s+ultimo|vuelve\s+atras)\b/g, () => plan.comandos.push("deshacer"));
  consumir(/\b(?:envia|enviar|enviala|manda|mandar|mandala|comparte|compartir)\s+(?:la\s+)?(?:cotizacion|pdf)?(?:\s+(?:por|al|a|via)\s+(?:whatsapp|wasap|guasap|whatsap|wassap|watsap))?(?=\s|¦|$)/g, () => plan.comandos.push("whatsapp"));
  consumir(/\b(?:genera|generar|crea|crear|descarga|descargar|saca|sacar|exporta|exportar|haz|hacer)\s+(?:el|la|un|una)?\s*(?:pdf|cotizacion\s+en\s+pdf|documento)\b/g, () => plan.comandos.push("pdf"));
  consumir(/\bimprim\w*\b/g, () => plan.comandos.push("imprimir"));

  /* --- Búsqueda en internet --- */
  const mv = /\b(?:busca|buscar|buscame|consulta|consultar|averigua|averiguar|investiga|investigar|encuentra|encontrar|localiza|localizar|traeme|trae|dame)\b/.exec(N);
  if (mv) {
    const resto = T.slice(mv.index + mv[0].length), nResto = norm(resto), obj = new Set();
    Object.entries(RE_OBJ).forEach(([k, re]) => { re.lastIndex = 0; if (re.test(nResto)) obj.add(k); });
    const web = /\b(?:internet|google|la web|la red|en linea)\b/.test(nResto);
    if (obj.size || web) {
      if (!obj.size || obj.has("todo")) ["nit", "razon", "telefono", "direccion", "correo"].forEach(k => obj.add(k));
      obj.delete("todo");
      plan.busqueda = { objetivos: Array.from(obj), entidad: limpiarEntidad(resto) };
      blank(mv.index, T.length - mv.index);
    }
  }

  /* --- Descuento --- */
  consumir(new RegExp("\\bdescuento\\s*(?:del?|es|de)?\\s*(" + RUN + ")\\s*(?:por\\s*ciento|%)?", "g"), m => { const v = num(m[1]); if (v != null) plan.descuento = Math.min(100, v); });
  consumir(new RegExp("\\b(" + RUN + ")\\s*(?:por\\s*ciento|%)\\s*de\\s*descuento", "g"), m => { const v = num(m[1]); if (v != null) plan.descuento = Math.min(100, v); });

  /* --- Horas --- */
  consumir(new RegExp("\\b(" + RUN + ")\\s+horas?\\s+(?:adicionales?|extras?)\\b", "g"), m => { const v = num(m[1]); if (v != null) plan.horasAdic = v; });
  consumir(new RegExp("\\bhoras?\\s+(?:adicionales?|extras?)\\s*(?:son|es|:|=|de)?\\s*(" + RUN + ")", "g"), m => { const v = num(m[1]); if (v != null) plan.horasAdic = v; });
  consumir(new RegExp("\\b(?:servicio|visita|atencion|trabajo)\\s+(?:de|por)\\s+(" + RUN + ")\\s+horas?\\b", "g"), m => { const v = num(m[1]); if (v != null) plan.horas = v; });
  consumir(new RegExp("\\bhoras?\\s+de\\s+(?:servicio|trabajo|visita)\\s*(?:son|es|:|=)?\\s*(" + RUN + ")", "g"), m => { const v = num(m[1]); if (v != null) plan.horas = v; });
  consumir(new RegExp("\\b(" + RUN + ")\\s+horas?(?:\\s+de\\s+(?:servicio|trabajo|visita))?\\b", "g"), m => { const v = num(m[1]); if (v != null) plan.horas = v; });

  /* --- Ítems --- */
  const ITEM = "(sondas?|equipos?|capacitaci(?:on|ones))";
  const claveItem = s => /^sonda/.test(s) ? "sondas" : /^equipo/.test(s) ? "equipos" : "capacitacion";
  consumir(new RegExp("\\b(" + RUN + ")\\s+" + ITEM + "\\b", "g"), m => { const v = num(m[1]); if (v != null) plan.items[claveItem(m[2])] = Math.floor(v); });
  consumir(new RegExp("\\b" + ITEM + "\\s*(?:son|es|:|=|x|por|cantidad|de)?\\s*(" + RUN + ")(?!\\s*(?:horas?|kilometros?|kms?|km|por\\s*ciento|%))", "g"), m => { const v = num(m[2]); if (v != null) plan.items[claveItem(m[1])] = Math.floor(v); });

  /* --- Viaje: trayecto y kilómetros --- */
  consumir(/\b(?:ida\s+y\s+regreso|ida\s+y\s+vuelta|viaje\s+redondo|redondo)\b/g, () => { plan.viaje.trayecto = 2; });
  consumir(/\b(?:solo|solamente|unicamente|sola)\s+ida\b/g, () => { plan.viaje.trayecto = 1; });
  consumir(new RegExp("\\b(" + RUN + ")\\s*(?:kilometros?|kms?|km)\\b", "g"), m => { const v = num(m[1]); if (v != null) plan.viaje.km = v; });

  /* --- Campos por marcador --- */
  const marcas = []; const re = RE_MARCA(); let mm;
  while ((mm = re.exec(N))) marcas.push({ i: mm.index, j: mm.index + mm[0].length, c: claveMarca(mm[1]) });
  const limpiarValor = v => {
    let s = String(v).split("¦")[0];
    s = s.replace(/^[\s,:;.\-=]+/, "");
    for (let k = 0; k < 3; k++) { const n = norm(s).match(/^(?:(?:es|son|sera|seria|esta|estan)\s+|igual\s+a\s+|a\s+nombre\s+de\s+|se\s+llama\s+|llamad[oa]\s+|del?\s+(?!la\s|los\s|las\s|el\s))/); if (!n) break; s = s.slice(n[0].length); }
    s = s.replace(/[\s,;.]+$/, "");
    s = s.replace(/\s+(?:y|e|ya)$/i, "");
    return colapsar(s);
  };
  const lead = limpiarValor(marcas.length ? T.slice(0, marcas[0].i) : T);
  /* "Estación de servicio X" justo después de "cliente"/"razón social" es el nombre del cliente, no una caja nueva. */
  const validas = [];
  marcas.forEach((mk, k) => {
    if (mk.c === "eds" && k > 0 && marcas[k - 1].c === "cliente") {
      const prev = limpiarValor(T.slice(marcas[k - 1].j, mk.i)); if (!prev) { marcas[k - 1].extiende = mk.j; return; }
    }
    validas.push(mk);
  });
  validas.forEach((mk, k) => {
    const ini = (mk.extiende || mk.j), fin = k + 1 < validas.length ? validas[k + 1].i : T.length;
    const ini2 = mk.extiende ? marcas.find(x => x.j === mk.extiende).i : mk.j;
    let crudo = mk.extiende ? T.slice(ini2, fin) : T.slice(ini, fin);
    if (mk.c === "notas") crudo = T.slice(mk.j);               // observaciones: todo lo que sigue
    const v = limpiarValor(crudo);
    if (mk.c === "notas" && k + 1 < validas.length) validas.length = k + 1;
    if (!v) { if (k === validas.length - 1) plan.pendiente = mk.c; return; }
    if (mk.c === "destino") plan.viaje.destino = v;
    else plan.campos[mk.c] = (mk.c === "notas" && plan.campos.notas) ? plan.campos.notas + " " + v : v;
  });

  /* --- Texto sin marcador: continúa un campo pendiente o el campo enfocado --- */
  if (lead) {
    if (ctx.pendiente && Date.now() - ctx.pendienteTs < 12000 && (marcas.length === 0 || validas.length === 0 || validas[0].i > 0)) {
      if (ctx.pendiente === "destino") plan.viaje.destino = lead; else plan.campos[ctx.pendiente] = lead;
    } else if (!marcas.length && ctx.enfoque && Date.now() - ctx.enfoqueTs < 90000) {
      plan.campos[ctx.enfoque] = lead;
    } else if (!marcas.length) plan.residuo = lead;
  }
  return plan;
}

/* ===================== 6. IA (Claude) ===================== */
const IA_KEY = "solvex:ia:v1";
const MODELOS = [["claude-sonnet-5-5", "Claude Sonnet 5.5 · recomendado"], ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 · más rápido y económico"], ["claude-opus-5-5", "Claude Opus 5.5 · máxima precisión"]];
const ia = { key: "", modelo: MODELOS[0][0], nlu: true, hablar: false };
try { Object.assign(ia, JSON.parse(localStorage.getItem(IA_KEY) || "{}")); } catch (_) {}
const guardarIA = () => { try { localStorage.setItem(IA_KEY, JSON.stringify(ia)); } catch (_) {} };
const iaActiva = () => !!(ia.key && ia.key.length > 20);

async function llamarClaude({ system, user, tools, maxTokens, timeoutMs }) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeoutMs || 45000);
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": ia.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(Object.assign({ model: ia.modelo, max_tokens: maxTokens || 1200, system, messages: [{ role: "user", content: user }] }, tools ? { tools } : {}))
    });
  } catch (e) {
    clearTimeout(to);
    throw new Error(e.name === "AbortError" ? "La IA tardó demasiado en responder" : "Sin conexión con la IA (revise Internet)");
  }
  clearTimeout(to);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("Error " + r.status);
    const e = new Error(r.status === 401 ? "La clave de IA no es válida" : r.status === 429 ? "Límite de uso de la IA alcanzado: espere un momento" : msg); e.status = r.status; throw e;
  }
  return data;
}
const textoDe = d => ((d && d.content) || []).filter(b => b.type === "text").map(b => b.text).join("\n");
function objetosJson(txt) {
  const out = []; let depth = 0, ini = -1, str = false, esc = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (str) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') { if (depth > 0) str = true; continue; }
    if (c === "{") { if (depth === 0) ini = i; depth++; }
    else if (c === "}" && depth > 0) { depth--; if (depth === 0) { try { out.push(JSON.parse(txt.slice(ini, i + 1))); } catch (_) {} } }
  }
  return out;
}
const SISTEMA_NLU = `Eres el motor de interpretación de voz de una app de cotizaciones de servicios técnicos para estaciones de servicio (EDS) en Colombia. Recibes lo que el usuario dictó (con errores típicos del reconocedor de voz: "nid", "need" o "nic" = NIT; "root" o "rud" = RUT; "wasap" = WhatsApp; números dichos con palabras) y el estado actual del formato. Devuelve ÚNICAMENTE un objeto JSON con SOLO lo que el usuario dijo explícitamente; no inventes ni completes datos. Esquema:
{"campos":{"cliente":"","nit":"","eds":"","ciudad":"","direccion":"","telefono":"","whatsapp":"","correo":"","contacto":"","tecnico":"","cargo":"","docFirma":"","notas":"","numero":"","fecha":"AAAA-MM-DD"},"horas":null,"horas_adicionales":null,"items":{"sondas":null,"equipos":null,"capacitacion":null},"viaje":{"destino":null,"km":null,"trayecto":null},"descuento":null,"busqueda":null,"comandos":[]}
Reglas: números en dígitos; teléfonos y NIT solo con dígitos; correos en minúscula con @; nombres propios con mayúscula inicial; "trayecto" es 1 (solo ida) o 2 (ida y regreso); "horas" 0-4 (si dice más de 4, pon 4 en horas y el resto en horas_adicionales); "busqueda" = {"objetivos":["nit","razon","telefono","celular","direccion","correo"],"entidad":"nombre de la estación o empresa a buscar o vacío si se refiere a la actual"} cuando pida buscar datos en internet; "comandos" puede contener "pdf","whatsapp","imprimir","deshacer","borrarFirma". Omite las claves que no se mencionaron.`;
async function nluClaude(texto, formato) {
  const data = await llamarClaude({ system: SISTEMA_NLU, user: JSON.stringify({ dictado: texto, formato_actual: formato }), maxTokens: 700, timeoutMs: 20000 });
  const objs = objetosJson(textoDe(data)); const o = objs[objs.length - 1];
  if (!o || typeof o !== "object") throw new Error("La IA no devolvió datos interpretables");
  const plan = { campos: {}, horas: null, horasAdic: null, items: {}, viaje: {}, descuento: null, busqueda: null, comandos: [], borrar: [], residuo: "", pendiente: null, motor: "ia" };
  Object.entries(o.campos || {}).forEach(([k, v]) => { if (CAMPOS[k] && v != null && String(v).trim() !== "") plan.campos[k] = String(v); });
  if (Number.isFinite(Number(o.horas)) && o.horas !== null) plan.horas = Number(o.horas);
  if (Number.isFinite(Number(o.horas_adicionales)) && o.horas_adicionales !== null) plan.horasAdic = Number(o.horas_adicionales);
  Object.entries(o.items || {}).forEach(([k, v]) => { if (["sondas", "equipos", "capacitacion"].includes(k) && v !== null && Number.isFinite(Number(v))) plan.items[k] = Math.max(0, Math.floor(Number(v))); });
  if (o.viaje) { if (o.viaje.destino) plan.viaje.destino = String(o.viaje.destino); if (o.viaje.km != null && Number.isFinite(Number(o.viaje.km))) plan.viaje.km = Number(o.viaje.km); if (o.viaje.trayecto === 1 || o.viaje.trayecto === 2) plan.viaje.trayecto = o.viaje.trayecto; }
  if (o.descuento != null && Number.isFinite(Number(o.descuento))) plan.descuento = Math.min(100, Math.max(0, Number(o.descuento)));
  if (o.busqueda && Array.isArray(o.busqueda.objetivos) && o.busqueda.objetivos.length) plan.busqueda = { objetivos: o.busqueda.objetivos.filter(x => ["nit", "razon", "telefono", "celular", "direccion", "correo"].includes(x)), entidad: String(o.busqueda.entidad || "") };
  (o.comandos || []).forEach(c => { if (["pdf", "whatsapp", "imprimir", "deshacer", "borrarFirma"].includes(c)) plan.comandos.push(c); });
  return plan;
}
const SISTEMA_BUSQUEDA = `Eres el motor de búsqueda de datos empresariales de una app de cotizaciones para estaciones de servicio (EDS) en Colombia. Usa la búsqueda web para localizar los datos pedidos de la empresa o estación indicada. Reglas: 1) Nunca inventes: si un dato no aparece en las fuentes, usa null. 2) NIT con formato 900123456-7 (sin puntos, con guion y dígito de verificación) solo si lo encontraste en una fuente (RUES, cámaras de comercio, página oficial o directorios empresariales). 3) Teléfonos con indicativo (fijos de Bogotá 601…; celulares 3XX…). 4) Si hay varias empresas parecidas, elige la que coincide con la ciudad indicada y explícalo en "notas". 5) Responde ÚNICAMENTE con un objeto JSON, sin texto adicional, con las claves: razon_social, nombre_comercial, nit, telefono, celular, direccion, ciudad, departamento, correo, sitio_web, confianza ("alta"|"media"|"baja"), notas, fuentes (lista de {titulo,url}).`;
async function buscarClaude(entidad, ciudad, objetivos, formato) {
  const pedidos = objetivos.map(o => ({ nit: "NIT", razon: "razón social", telefono: "teléfono", celular: "celular/WhatsApp", direccion: "dirección", correo: "correo" }[o] || o)).join(", ");
  const user = `Busca: "${entidad}"${ciudad ? " — ciudad: " + ciudad : ""}. Datos solicitados: ${pedidos}. Contexto del formato actual: ${JSON.stringify(formato)}.`;
  const data = await llamarClaude({
    system: SISTEMA_BUSQUEDA, user, maxTokens: 1500, timeoutMs: 60000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "CO", timezone: "America/Bogota" } }]
  });
  const objs = objetosJson(textoDe(data)); const r = objs[objs.length - 1];
  if (!r) throw new Error("La IA no encontró datos concluyentes");
  const urls = []; ((data.content) || []).forEach(b => { if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach(x => { if (x.url) urls.push({ titulo: x.title || x.url, url: x.url }); }); });
  r.fuentes = (Array.isArray(r.fuentes) && r.fuentes.length ? r.fuentes : urls).filter(f => f && /^https?:\/\//.test(f.url || "")).slice(0, 5);
  r.motor = "IA Claude con búsqueda web";
  return r;
}
/* Respaldo gratuito: OpenStreetMap (dirección y teléfono cuando existen; el NIT no está allí). */
async function buscarOSM(entidad, ciudad) {
  const q = colapsar(entidad + " " + (ciudad || ""));
  const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=5&countrycodes=co&accept-language=es&q=" + encodeURIComponent(q));
  if (!res.ok) throw new Error("No fue posible consultar OpenStreetMap");
  const lista = await res.json();
  if (!lista.length) throw new Error("OpenStreetMap no tiene registros de «" + entidad + "»");
  const e = lista.find(x => x.type === "fuel") || lista[0], x = e.extratags || {}, a = e.address || {};
  return {
    razon_social: null, nombre_comercial: (e.namedetails && (e.namedetails.name || e.namedetails["name:es"])) || e.name || null, nit: null,
    telefono: x.phone || x["contact:phone"] || null, celular: x["contact:mobile"] || null,
    direccion: [a.road, a.house_number].filter(Boolean).join(" ") || null,
    ciudad: a.city || a.town || a.village || a.municipality || null, departamento: a.state || null,
    correo: x.email || x["contact:email"] || null, sitio_web: x.website || x["contact:website"] || null,
    confianza: "media", notas: "Datos de OpenStreetMap (colaborativo). El NIT no está disponible en esta fuente.",
    fuentes: [{ titulo: "OpenStreetMap · " + (e.display_name || ""), url: "https://www.openstreetmap.org/" + (e.osm_type || "node") + "/" + e.osm_id }], motor: "OpenStreetMap (gratis)"
  };
}

/* ===================== 7. Aplicar el plan al formato ===================== */
let pilaUndo = [];
const instantanea = () => { try { pilaUndo.push(JSON.stringify(state)); if (pilaUndo.length > 20) pilaUndo.shift(); } catch (_) {} };
function destello(el) { if (!el) return; el.classList.remove("vz-flash"); void el.offsetWidth; el.classList.add("vz-flash"); setTimeout(() => el.classList.remove("vz-flash"), 2200); }
let primerCambio = null;
function marcarCambio(el) { destello(el); if (!primerCambio && el) primerCambio = el; }
function verCambio() {
  const el = primerCambio; primerCambio = null; if (!el) return;
  try { const r = el.getBoundingClientRect(), alto = window.innerHeight; if (r.top < 70 || r.bottom > alto * 0.5) window.scrollTo({ top: window.scrollY + r.top - alto * 0.18, behavior: "smooth" }); } catch (_) {}
}
function setCampo(c, crudo, opciones) {
  const d = CAMPOS[c], f = d.f(crudo), res = { campo: c, et: d.et, valor: f.valor, aviso: f.aviso, ok: false };
  if (!f.valor) return res;
  let v = f.valor;
  if (d.anexar && state.meta[d.meta] && !(opciones && opciones.reemplazar)) v = state.meta[d.meta].replace(/\s+$/, "") + "\n" + v;
  state.meta[d.meta] = v; const el = $(d.id); if (el) { el.value = v; marcarCambio(el); }
  if (c === "tecnico" || c === "cargo" || c === "docFirma") { try { sigEstado(); } catch (_) {} }
  saveState(); res.ok = true; res.valor = f.valor; return res;
}
const NOMBRE_ITEM = { sondas: "Sondas", equipos: "Equipos", capacitacion: "Capacitación" };
function aplicarPlan(plan) {
  const log = []; let cambio = false;
  const hayDatos = Object.keys(plan.campos).length || plan.horas != null || plan.horasAdic != null || Object.keys(plan.items).length || Object.keys(plan.viaje).length || plan.descuento != null || plan.borrar.length;
  if (hayDatos) instantanea();
  primerCambio = null;
  ORDEN.forEach(c => {
    if (plan.campos[c] == null) return;
    const r = setCampo(c, plan.campos[c]);
    if (r.ok) { cambio = true; log.push({ t: "ok", et: r.et, v: r.valor }); if (r.aviso) log.push({ t: "warn", x: r.aviso }); }
    else log.push({ t: "warn", x: `${r.et}: ${r.aviso || "no pude interpretar «" + plan.campos[c] + "»"}` });
  });
  plan.borrar.forEach(c => { const d = CAMPOS[c]; if (!d) return; state.meta[d.meta] = ""; const el = $(d.id); if (el) { el.value = ""; marcarCambio(el); } saveState(); cambio = true; log.push({ t: "ok", et: d.et, v: "(borrado)" }); });
  /* Horas */
  if (plan.horas != null || plan.horasAdic != null) {
    let h = plan.horas, ad = plan.horasAdic;
    if (h != null) { if (h > 4) { if (ad == null) ad = h - 4; h = 4; } state.horas = Math.max(0, Math.min(4, Math.floor(h))); }
    if (ad != null) state.horasAdicionales = Math.max(0, ad);
    syncHorasExtras(); render(); cambio = true;
    if (h != null) { log.push({ t: "ok", et: "Horas de servicio", v: String(state.horas) }); marcarCambio($("hoursGrid")); }
    if (ad != null) { log.push({ t: "ok", et: "Horas adicionales", v: String(state.horasAdicionales) }); marcarCambio($("extraHoras")); }
  }
  /* Ítems */
  Object.entries(plan.items).forEach(([k, n]) => {
    let idx = state.items.findIndex(it => claveTarifaItem(it.nombre) === k);
    if (idx < 0) { state.items.push({ id: uid(), nombre: NOMBRE_ITEM[k], tarifa: state.tarifas[k] || 0, cantidad: 0 }); idx = state.items.length - 1; }
    state.items[idx].cantidad = n; render(); cambio = true;
    log.push({ t: "ok", et: NOMBRE_ITEM[k], v: String(n) });
    const fila = $("itemsBody") && $("itemsBody").children[idx]; marcarCambio(fila);
  });
  /* Viaje */
  const vj = plan.viaje; let rutaAuto = false;
  if (vj.destino != null || vj.km != null || vj.trayecto != null) {
    if (vj.destino) { state.viaje.destino = formatoLugar(vj.destino); log.push({ t: "ok", et: "Destino del viaje", v: state.viaje.destino }); marcarCambio($("vDestino")); }
    if (vj.trayecto) { state.viaje.trayecto = vj.trayecto; log.push({ t: "ok", et: "Trayecto", v: vj.trayecto === 2 ? "Ida y regreso" : "Solo ida" }); }
    if (vj.km != null) { state.viaje.kmIda = vj.km; state.viaje.fuente = "voz"; log.push({ t: "ok", et: "Kilómetros de ida", v: String(vj.km) }); marcarCambio($("vKm")); }
    state.viaje.kmFacturables = Math.round(state.viaje.kmIda * state.viaje.trayecto * 10) / 10;
    syncViaje(); render(); cambio = true;
    if (vj.destino && vj.km == null) rutaAuto = true;
  }
  if (plan.descuento != null) { state.descuento = plan.descuento; const e = $("descInput"); if (e) e.value = plan.descuento; render(); cambio = true; log.push({ t: "ok", et: "Descuento", v: plan.descuento + " %" }); marcarCambio(e); }
  if (cambio) { try { saveState(); } catch (_) {} verCambio(); }
  return { log, rutaAuto };
}
function restaurar() {
  if (!pilaUndo.length) return false;
  const x = JSON.parse(pilaUndo.pop());
  state = x; syncMeta(); syncEmpresa(); syncTarifas(); syncViaje(); syncHorasExtras(); render();
  return true;
}

/* ===================== 8. Panel y botón flotante ===================== */
const CSS = `
.vz-fab{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px) + var(--vz-ph,0px));z-index:9996;width:78px;height:78px;border:0;border-radius:50%;cursor:pointer;color:#fff;
  background:conic-gradient(from 210deg,#00e5ff,#2f60dd,#9f4dec,#ff3d9a,#ffb300,#00e5ff);box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 26px rgba(37,200,239,.65);
  display:flex;align-items:center;justify-content:center;transition:transform .15s,bottom .25s;animation:vzSpin 6s linear infinite}
.vz-fab::before{content:"";position:absolute;inset:5px;border-radius:50%;background:radial-gradient(circle at 30% 25%,#35b8ff,#2a3fd8 55%,#5b21b6);box-shadow:inset 0 2px 10px rgba(255,255,255,.35)}
.vz-fab>*{position:relative}.vz-fab:active{transform:scale(.93)}
.vz-fab svg{width:36px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
.vz-ring{position:absolute!important;inset:-4px;border-radius:50%;border:3px solid rgba(37,200,239,.75);animation:vzRing 2.2s ease-out infinite;pointer-events:none}.vz-ring.r2{animation-delay:1.1s}
.vz-eq{display:none;gap:4px;align-items:center;height:34px}.vz-eq i{display:block;width:6px;border-radius:3px;background:#fff;height:12px;animation:vzEq .8s ease-in-out infinite}.vz-eq i:nth-child(2){animation-delay:.15s}.vz-eq i:nth-child(3){animation-delay:.3s}.vz-eq i:nth-child(4){animation-delay:.45s}
.vz-fab.on{animation:none;background:conic-gradient(from 0deg,#ff1744,#ff3d9a,#ff9100,#ff1744);box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 34px rgba(255,23,68,.8)}
.vz-fab.on::before{background:radial-gradient(circle at 30% 25%,#ff6b8a,#e0123f 60%,#8f0a2b)}
.vz-fab.on svg{display:none}.vz-fab.on .vz-eq{display:flex}.vz-fab.on .vz-ring{border-color:rgba(255,61,110,.85);animation-duration:1.2s}
.vz-fab.busy::before{background:radial-gradient(circle at 30% 25%,#ffd54f,#ff9800 60%,#c25e00)}
.vz-tip{position:fixed;right:104px;bottom:calc(40px + env(safe-area-inset-bottom,0px) + var(--vz-ph,0px));z-index:9996;background:linear-gradient(135deg,#0d1a31,#17335e);color:#eaf6ff;border:1px solid #25c8ef;border-radius:999px;padding:9px 14px;font:800 13px/1 system-ui,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.4);animation:vzTip 3s ease-in-out infinite;pointer-events:none;white-space:nowrap}
.vz-panel{position:fixed;left:0;right:0;bottom:0;z-index:9995;max-height:66vh;display:flex;flex-direction:column;background:#0b1730;color:#eaf1ff;border-top:3px solid #25c8ef;border-radius:20px 20px 0 0;box-shadow:0 -14px 40px rgba(0,0,0,.55);transform:translateY(110%);transition:transform .28s ease;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding-bottom:env(safe-area-inset-bottom,0px)}
.vz-panel.open{transform:translateY(0)}
.vz-head{display:flex;align-items:center;gap:8px;padding:12px 14px 6px}
.vz-title{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.vz-title b{font-size:16px;background:linear-gradient(90deg,#25c8ef,#9f4dec,#ff3d9a);-webkit-background-clip:text;background-clip:text;color:transparent}
.vz-badge{font-size:11px;font-weight:800;border-radius:999px;padding:3px 9px;background:#12315a;color:#7fe3ff;border:1px solid #25c8ef}.vz-badge.ia{background:#0c3a2a;color:#7be8b9;border-color:#11b985}
.vz-ib{border:0;background:#17284a;color:#cfe3ff;width:36px;height:36px;border-radius:10px;font-size:17px;cursor:pointer}.vz-ib:hover{background:#21386a}
.vz-estado{padding:0 14px;font-size:13px;color:#9db4d8;min-height:18px}.vz-estado.on{color:#ff8fa8;font-weight:800}.vz-estado.busy{color:#ffd166;font-weight:800}
.vz-trans{margin:8px 14px 0;padding:10px 12px;background:#101f3d;border:1px solid #2a4170;border-radius:12px;min-height:44px;max-height:96px;overflow:auto;font-size:15px}
.vz-trans .p{color:#8aa0c8;font-style:italic}.vz-trans:empty::before{content:"Aquí aparece lo que dice…";color:#5f78a6}
.vz-in{display:flex;gap:8px;padding:8px 14px 0}.vz-in input{flex:1;min-width:0;background:#0a1329;border:1px solid #33518a;color:#fff;border-radius:10px;padding:10px 12px;font:inherit}.vz-in input:focus{outline:2px solid #25c8ef}
.vz-in button{border:0;border-radius:10px;padding:0 14px;background:linear-gradient(135deg,#25c8ef,#2f60dd);color:#fff;font-weight:900;font-size:16px;cursor:pointer}
.vz-log{flex:1;min-height:60px;overflow:auto;padding:8px 14px;display:grid;gap:8px;align-content:start}
.vz-it{border:1px solid #27406f;background:#0f2244;border-radius:12px;padding:8px 11px}.vz-it.ok{border-color:#157a58;background:#0b2b25}.vz-it.warn{border-color:#9a7a1f;background:#2b2410}.vz-it.err{border-color:#a13a4b;background:#2c1119}.vz-it.cmd{border-color:#5b3fb0;background:#1b1540}
.vz-it h4{margin:0 0 4px;font-size:13px;color:#cfe3ff}.vz-row{display:grid;grid-template-columns:minmax(92px,auto) 1fr;gap:2px 10px;align-items:baseline;font-size:13px;padding:2px 0}.vz-row span{color:#8aa6d4;font-weight:700}.vz-row b{color:#fff;overflow-wrap:anywhere}
.vz-row .tag{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:12px}.vz-row .tag em{font-style:normal;color:#7be8b9;font-weight:800}
.vz-btn{border:1px solid #3f6bc0;background:#15294f;color:#dcebff;border-radius:8px;padding:5px 10px;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none;display:inline-block}.vz-btn:hover{background:#1f3a73}
.vz-src{font-size:12px;color:#8aa6d4;margin-top:4px;overflow-wrap:anywhere}.vz-src a{color:#7fd4ff}
.vz-spin{display:inline-block;width:13px;height:13px;border:2px solid #3b5a96;border-top-color:#25c8ef;border-radius:50%;animation:vzSpin .8s linear infinite;vertical-align:-2px}
.vz-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 14px 12px;border-top:1px solid #1d3157;font-size:12px;color:#9db4d8}.vz-foot label{display:flex;align-items:center;gap:6px;margin-left:auto}
.vz-cfg{display:none;padding:8px 14px 12px;overflow:auto;gap:10px}.vz-cfg.open{display:grid}.vz-cfg label{display:grid;gap:4px;font-size:12px;font-weight:700;color:#9db4d8}.vz-cfg input[type=password],.vz-cfg input[type=text],.vz-cfg select{background:#0a1329;border:1px solid #33518a;color:#fff;border-radius:10px;padding:10px 12px;font:inherit}
.vz-cfg .nota{font-size:12px;color:#8aa6d4;line-height:1.5}.vz-help{display:none;padding:0 14px 8px;font-size:12px;color:#9db4d8}.vz-help.open{display:block}.vz-help button{display:block;width:100%;text-align:left;margin:4px 0;border:1px dashed #3f6bc0;background:#0f2244;color:#cfe3ff;border-radius:9px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer}
.vz-flash{animation:vzFlash 2.1s ease-out}
.solvexVoiceBtn,#solvexVoiceBtn,#solvexVoiceHint{display:none!important}
@keyframes vzSpin{to{transform:rotate(360deg)}}@keyframes vzRing{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.5);opacity:0}}
@keyframes vzEq{0%,100%{height:10px}50%{height:32px}}@keyframes vzTip{0%,100%{transform:translateX(0)}50%{transform:translateX(-6px)}}
@keyframes vzFlash{0%{box-shadow:0 0 0 0 rgba(17,185,133,.95);background-color:#0f4a38}35%{box-shadow:0 0 0 7px rgba(17,185,133,.45)}100%{box-shadow:0 0 0 0 rgba(17,185,133,0)}}
@media(min-width:900px){.vz-panel{left:auto;right:20px;bottom:112px;width:410px;max-height:70vh;border-radius:18px;border:2px solid #25c8ef}.vz-fab{bottom:24px!important}.vz-tip{bottom:46px!important}}
@media print{.vz-fab,.vz-tip,.vz-panel{display:none!important}}
`;
const EJEMPLOS = [
  "Cliente Inversiones Los Pinos, NIT 900123456, estación Los Pinos, ciudad Zipaquirá.",
  "Teléfono 601 234 5678, WhatsApp 300 123 4567, correo ventas arroba lospinos punto com punto co.",
  "Servicio de tres horas, dos sondas, una capacitación, viaje a Zipaquirá, ida y regreso, ochenta kilómetros.",
  "Busca en internet el NIT y el teléfono de la estación Terpel La Esperanza en Chía.",
  "Observaciones: validez de la oferta quince días.",
  "Genera el PDF."
];
let panel, fab, tip, elLog, elTrans, elEstado, elTxt, elBadge;
let estado = "inactivo", quiereEscuchar = false, rec = null, cola = Promise.resolve();
const ctx = { pendiente: null, pendienteTs: 0, enfoque: null, enfoqueTs: 0 };
const ANDROID_UA = /Android/i.test(navigator.userAgent);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const nativoVivo = () => !!(window.AndroidVoice && typeof window.AndroidVoice.stopListening === "function");
const nativoBasico = () => !!(window.AndroidVoice && typeof window.AndroidVoice.startListening === "function");

function construirUI() {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  tip = document.createElement("div"); tip.className = "vz-tip"; tip.textContent = "🎙 Asistente de voz IA"; document.body.appendChild(tip);
  fab = document.createElement("button"); fab.type = "button"; fab.className = "vz-fab"; fab.id = "vzFab";
  fab.setAttribute("aria-label", "Asistente de voz con IA: tocar para hablar"); fab.setAttribute("aria-pressed", "false");
  fab.innerHTML = '<span class="vz-ring"></span><span class="vz-ring r2"></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3" fill="#fff"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg><span class="vz-eq"><i></i><i></i><i></i><i></i></span>';
  document.body.appendChild(fab);
  panel = document.createElement("div"); panel.className = "vz-panel"; panel.id = "vzPanel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Asistente de voz con IA");
  panel.innerHTML = `
    <div class="vz-head"><div class="vz-title"><b>Asistente de voz IA</b><span class="vz-badge" id="vzBadge"></span></div>
      <button class="vz-ib" id="vzAyudaBtn" type="button" aria-label="Ejemplos de qué decir">?</button>
      <button class="vz-ib" id="vzCfgBtn" type="button" aria-label="Ajustes de IA">⚙</button>
      <button class="vz-ib" id="vzCerrar" type="button" aria-label="Cerrar">✕</button></div>
    <div class="vz-estado" id="vzEstado"></div>
    <div class="vz-trans" id="vzTrans" aria-live="polite"></div>
    <div class="vz-in"><input id="vzTxt" type="text" placeholder="…o escriba una orden y presione Enter" autocomplete="off"><button id="vzEnviar" type="button" aria-label="Enviar orden">➤</button></div>
    <div class="vz-help" id="vzHelp"><b>Toque un ejemplo para probarlo:</b></div>
    <div class="vz-cfg" id="vzCfg"></div>
    <div class="vz-log" id="vzLog"></div>
    <div class="vz-foot"><button class="vz-btn" id="vzUndo" type="button">↶ Deshacer</button><button class="vz-btn" id="vzLimpiarLog" type="button">Limpiar lista</button><label><input type="checkbox" id="vzHablar"> Respuesta por voz</label></div>`;
  document.body.appendChild(panel);
  elLog = $("vzLog"); elTrans = $("vzTrans"); elEstado = $("vzEstado"); elTxt = $("vzTxt"); elBadge = $("vzBadge");
  const help = $("vzHelp"); EJEMPLOS.forEach(e => { const b = document.createElement("button"); b.type = "button"; b.textContent = "«" + e + "»"; b.addEventListener("click", () => { elTxt.value = e; enviarTexto(); }); help.appendChild(b); });
  fab.addEventListener("click", alternar);
  $("vzCerrar").addEventListener("click", cerrar);
  $("vzAyudaBtn").addEventListener("click", () => help.classList.toggle("open"));
  $("vzCfgBtn").addEventListener("click", alternarCfg);
  $("vzEnviar").addEventListener("click", enviarTexto);
  elTxt.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); enviarTexto(); } });
  $("vzUndo").addEventListener("click", () => { addLog(restaurar() ? "ok" : "warn", restaurar.length, "") || 0; });
  $("vzUndo").onclick = () => { const ok = restaurar(); logSimple(ok ? "ok" : "warn", ok ? "↶ Se deshizo la última acción del asistente." : "No hay acciones para deshacer."); };
  $("vzLimpiarLog").addEventListener("click", () => { elLog.textContent = ""; });
  const hb = $("vzHablar"); hb.checked = !!ia.hablar; hb.addEventListener("change", () => { ia.hablar = hb.checked; guardarIA(); });
  if ("ResizeObserver" in window) new ResizeObserver(() => { document.documentElement.style.setProperty("--vz-ph", panel.classList.contains("open") && window.innerWidth < 900 ? panel.offsetHeight + "px" : "0px"); }).observe(panel);
  document.addEventListener("focusin", e => { const t = e.target; if (!t || !t.id) return; const c = Object.keys(CAMPOS).find(k => CAMPOS[k].id === t.id); if (c) { ctx.enfoque = c; ctx.enfoqueTs = Date.now(); } });
  actualizarBadge(); setEstado("inactivo");
  setTimeout(() => { if (tip) tip.style.display = "none"; }, 20000);
}
function actualizarBadge() { if (!elBadge) return; const on = iaActiva(); elBadge.textContent = on ? "IA Claude activa" : "Motor local"; elBadge.className = "vz-badge" + (on ? " ia" : ""); }
function setEstado(e, txt) {
  estado = e;
  if (fab) { fab.classList.toggle("on", e === "escuchando"); fab.classList.toggle("busy", e === "procesando"); fab.setAttribute("aria-pressed", e === "escuchando" ? "true" : "false"); }
  if (elEstado) {
    elEstado.className = "vz-estado" + (e === "escuchando" ? " on" : e === "procesando" ? " busy" : "");
    elEstado.textContent = txt || (e === "escuchando" ? "● Escuchando… hable con naturalidad (toque el botón para detener)" : e === "procesando" ? "Interpretando y llenando el formato…" : "Toque el micrófono y dicte. Ej.: «Cliente Los Pinos, NIT 900123456, ciudad Zipaquirá»");
  }
}
function abrir() { panel.classList.add("open"); if (tip) tip.style.display = "none"; }
function cerrar() { detener(); panel.classList.remove("open"); document.documentElement.style.setProperty("--vz-ph", "0px"); }
function alternarCfg() { const c = $("vzCfg"); if (!c.classList.contains("open")) pintarCfg(); c.classList.toggle("open"); }
function alternar() { if (estado === "escuchando") { detener(); } else { abrir(); iniciar(); } }

function logSimple(tipo, html) { const d = document.createElement("div"); d.className = "vz-it " + tipo; d.innerHTML = html; elLog.prepend(d); return d; }
function addLog() { return null; }
function decir(msg) { if (!ia.hablar || !("speechSynthesis" in window)) return; try { const u = new SpeechSynthesisUtterance(msg); u.lang = "es-CO"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {} }

/* ---------- Reconocimiento de voz ---------- */
function iniciar() {
  if (estado === "escuchando") return;
  quiereEscuchar = true;
  if (nativoVivo() || nativoBasico()) { try { window.AndroidVoice.startListening(); setEstado("escuchando"); } catch (e) { quiereEscuchar = false; logSimple("err", "No se pudo iniciar la voz de Android: " + esc(e.message || e)); } return; }
  if (!SR) { quiereEscuchar = false; setEstado("inactivo"); logSimple("warn", "Este navegador no permite dictado por voz. Use Chrome o la app Android, o escriba la orden en el cuadro de texto."); elTxt.focus(); return; }
  try {
    rec = new SR(); rec.lang = "es-CO"; rec.interimResults = true; rec.continuous = !ANDROID_UA; rec.maxAlternatives = 1;
    rec.onstart = () => setEstado("escuchando");
    rec.onresult = e => { let parcial = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalChunk(r[0].transcript); else parcial += r[0].transcript; } mostrarParcial(parcial); };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { quiereEscuchar = false; logSimple("err", "El micrófono está bloqueado. Permita el acceso al micrófono en el navegador (icono del candado) y vuelva a intentar."); }
      else if (e.error === "network") { quiereEscuchar = false; logSimple("err", "El reconocimiento de voz necesita conexión a Internet."); }
      else if (e.error === "audio-capture") { quiereEscuchar = false; logSimple("err", "No se detecta un micrófono."); }
    };
    rec.onend = () => { if (quiereEscuchar) setTimeout(() => { try { rec.start(); } catch (_) {} }, 200); else { mostrarParcial(""); if (estado === "escuchando") setEstado("inactivo"); } };
    rec.start();
  } catch (e) { quiereEscuchar = false; setEstado("inactivo"); logSimple("err", "No se pudo iniciar el micrófono: " + esc(e.message || e)); }
}
function detener() {
  quiereEscuchar = false;
  try { if (rec) rec.stop(); } catch (_) {}
  try { if (nativoVivo()) window.AndroidVoice.stopListening(); } catch (_) {}
  if (estado === "escuchando") setEstado("inactivo");
  mostrarParcial("");
}
function mostrarParcial(t) { const p = elTrans.querySelector(".p"); if (t) { if (p) p.textContent = t; else { const s = document.createElement("div"); s.className = "p"; s.textContent = t; elTrans.appendChild(s); } } else if (p) p.remove(); }
function mostrarFinal(t) { const p = elTrans.querySelector(".p"); if (p) p.remove(); const d = document.createElement("div"); d.textContent = "🗣 " + t; elTrans.appendChild(d); while (elTrans.children.length > 4) elTrans.firstChild.remove(); elTrans.scrollTop = elTrans.scrollHeight; }
function finalChunk(t) { t = String(t || "").trim(); if (!t) return; mostrarFinal(t); cola = cola.then(() => procesar(t)).catch(e => logSimple("err", esc(e.message || e))); }
function enviarTexto() { const t = elTxt.value.trim(); if (!t) return; elTxt.value = ""; abrir(); finalChunk(t); }

/* Puente con la app Android (SpeechRecognizer nativo) */
function nativo(evt, txt) {
  if (evt === "listo") { setEstado("escuchando"); }
  else if (evt === "parcial") mostrarParcial(txt);
  else if (evt === "final") finalChunk(txt);
  else if (evt === "fin") { mostrarParcial(""); if (!quiereEscuchar || !nativoVivo()) setEstado("inactivo"); }
  else if (evt === "error") { quiereEscuchar = false; setEstado("inactivo"); logSimple("err", esc(txt)); }
  else if (evt === "permiso") { logSimple("warn", esc(txt)); }
}

/* ---------- Procesamiento ---------- */
function formatoActual() { const o = {}; ORDEN.forEach(c => { const v = state.meta[CAMPOS[c].meta]; if (v) o[c] = String(v).slice(0, 160); }); return o; }
async function procesar(texto) {
  setEstado("procesando");
  let plan = null, aviso = "";
  if (iaActiva() && ia.nlu) { try { plan = await nluClaude(texto, formatoActual()); } catch (e) { aviso = "La IA no respondió (" + (e.message || e) + "); se usó el motor local."; } }
  if (!plan) plan = analizarLocal(texto, ctx);
  if (plan.pendiente) { ctx.pendiente = plan.pendiente; ctx.pendienteTs = Date.now(); } else if (Object.keys(plan.campos).length || Object.keys(plan.viaje).length) ctx.pendiente = null;
  if (aviso) logSimple("warn", "⚠ " + esc(aviso));
  await ejecutar(plan, texto);
  if (estado === "procesando") setEstado(quiereEscuchar ? "escuchando" : "inactivo");
}
async function ejecutar(plan, texto) {
  const comandos = plan.comandos.slice();
  const idxDes = comandos.indexOf("deshacer");
  if (idxDes >= 0) { comandos.splice(idxDes, 1); const ok = restaurar(); logSimple(ok ? "ok" : "warn", ok ? "↶ Se deshizo la última acción del asistente." : "No hay acciones para deshacer."); decir(ok ? "Listo, deshice la última acción" : "No hay nada para deshacer"); }
  const { log, rutaAuto } = aplicarPlan(plan);
  if (log.length) {
    const filas = log.filter(l => l.t === "ok").map(l => `<div class="vz-row"><span>${esc(l.et)}</span><b>${esc(l.v).replace(/\n/g, "<br>")}</b></div>`).join("");
    const avisos = log.filter(l => l.t === "warn").map(l => `<div class="vz-row"><span>⚠</span><b style="color:#ffd166">${esc(l.x)}</b></div>`).join("");
    logSimple(filas ? "ok" : "warn", `<h4>${plan.motor === "ia" ? "✔ Interpretado con IA" : "✔ Datos llenados"}</h4>${filas}${avisos}`);
    const n = log.filter(l => l.t === "ok").length; if (n) decir(`Listo, llené ${n} ${n === 1 ? "dato" : "datos"}`);
  }
  if (plan.residuo && !log.length && !plan.busqueda && !comandos.length) {
    const d = logSimple("warn", `No supe en qué caja poner: <b>«${esc(plan.residuo)}»</b><br>Diga el nombre del campo (cliente, NIT, ciudad, teléfono…) o agréguelo a observaciones. <button class="vz-btn" type="button">Agregar a observaciones</button>`);
    d.querySelector("button").addEventListener("click", () => { instantanea(); const r = setCampo("notas", plan.residuo); if (r.ok) { d.className = "vz-it ok"; d.innerHTML = "✔ Agregado a observaciones."; verCambio(); } });
    decir("No entendí en qué campo ponerlo");
  }
  if (rutaAuto && typeof calcularRuta === "function") { logSimple("cmd", `<span class="vz-spin"></span> Calculando la ruta a <b>${esc(state.viaje.destino)}</b>…`); try { await calcularRuta(); logSimple("ok", `🛣 Ruta lista: ${state.viaje.kmIda} km de ida · ${state.viaje.kmFacturables} km facturables.`); } catch (_) {} }
  for (const c of comandos) await comando(c);
  if (plan.busqueda) await ejecutarBusqueda(plan.busqueda);
}
async function comando(c) {
  const mapa = { pdf: ["pdfBtn", "⚡ Generando el PDF…"], whatsapp: ["whatsappBtn", "⚡ Enviando por WhatsApp…"], imprimir: ["printBtn", "⚡ Abriendo la impresión…"], borrarFirma: ["sigClearBtn", "⚡ Firma borrada."] };
  const m = mapa[c]; if (!m) return; const b = $(m[0]); if (!b) return;
  logSimple("cmd", esc(m[1])); setTimeout(() => b.click(), 150);
}

/* ---------- Búsqueda en internet ---------- */
const ETQ_OBJ = { nit: "NIT", razon: "razón social", telefono: "teléfono", celular: "WhatsApp", direccion: "dirección", correo: "correo" };
async function ejecutarBusqueda(b) {
  const actual = state.meta.eds || state.meta.cliente || "";
  const entidad = (b.entidad && !/^(?:esta|este|la|el|actual|cliente|estacion|empresa)$/i.test(norm(b.entidad)) ? b.entidad : "") || actual;
  if (!entidad) { logSimple("warn", "Para buscar en internet diga el nombre. Ej.: «Busca el NIT de la estación Terpel La Esperanza en Chía»."); decir("Dígame el nombre de la estación para buscar"); return; }
  const ciudad = state.meta.ciudad || "";
  const objetivos = b.objetivos && b.objetivos.length ? b.objetivos : ["nit", "razon", "telefono", "direccion", "correo"];
  const card = logSimple("cmd", `<h4><span class="vz-spin"></span> Buscando en internet…</h4><div class="vz-row"><span>Qué</span><b>${esc(objetivos.map(o => ETQ_OBJ[o] || o).join(", "))}</b></div><div class="vz-row"><span>De</span><b>${esc(entidad)}${ciudad ? " · " + esc(ciudad) : ""}</b></div>`);
  decir("Buscando en internet");
  let res = null, nota = "";
  if (iaActiva()) { try { res = await buscarClaude(entidad, ciudad, objetivos, formatoActual()); } catch (e) { nota = "La búsqueda con IA falló (" + (e.message || e) + "). "; } }
  if (!res) { try { res = await buscarOSM(entidad, ciudad); } catch (e) { nota += e.message || String(e); } }
  if (!res) { card.className = "vz-it err"; card.innerHTML = `<h4>🔎 Sin resultados</h4><div class="vz-src">${esc(nota)}</div>${enlacesManual(entidad, ciudad)}`; decir("No encontré resultados"); return; }
  mostrarResultado(card, res, objetivos, entidad, ciudad, nota);
}
function enlacesManual(entidad, ciudad) {
  const q = encodeURIComponent("NIT " + entidad + " " + (ciudad || "") + " Colombia");
  return `<div class="vz-src">Puede buscarlo usted y dictármelo: <a class="vz-btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}">Buscar NIT en Google</a> <a class="vz-btn" target="_blank" rel="noopener" href="https://www.rues.org.co/">RUES</a></div>`;
}
function mostrarResultado(card, res, objetivos, entidad, ciudad, nota) {
  const obj = new Set(objetivos), prop = [];
  const add = (campo, valor, etq) => { if (valor != null && String(valor).trim() !== "") prop.push({ campo, valor: String(valor), etq }); };
  if (obj.has("nit")) add("nit", res.nit, "NIT");
  if (obj.has("razon") || obj.has("nit")) add("cliente", res.razon_social, "Cliente / razón social");
  if (obj.has("telefono")) add("telefono", res.telefono, "Teléfono");
  if (obj.has("celular")) add("whatsapp", res.celular || (res.telefono && /^\D*(?:\+?57)?\D*3\d/.test(res.telefono) ? res.telefono : null), "WhatsApp");
  if (obj.has("direccion")) add("direccion", res.direccion, "Dirección");
  if (obj.has("correo")) add("correo", res.correo, "Correo");
  if (obj.has("direccion") || obj.has("nit")) add("ciudad", res.ciudad, "Ciudad");
  instantanea(); primerCambio = null;
  const filas = [], faltan = [];
  prop.forEach(p => {
    const d = CAMPOS[p.campo], f = d.f(p.valor);
    if (!f.valor) { faltan.push(p.etq + " (no interpretable)"); return; }
    const actual = String(state.meta[d.meta] || "").trim();
    const igual = norm(actual) === norm(f.valor);
    const fila = document.createElement("div"); fila.className = "vz-row";
    fila.innerHTML = `<span>${esc(p.etq)}</span><b>${esc(f.valor)}</b><div class="tag"></div>`;
    const tag = fila.querySelector(".tag");
    if (igual) tag.innerHTML = "<em>= ya estaba</em>";
    else if (!actual || p.campo === "ciudad" && !actual) { const r = setCampo(p.campo, p.valor, { reemplazar: true }); tag.innerHTML = r.ok ? "<em>✔ llenado en su caja</em>" : "<em style='color:#ffd166'>no se pudo llenar</em>"; if (r.aviso) tag.innerHTML += `<span style="color:#ffd166">⚠ ${esc(r.aviso)}</span>`; }
    else {
      tag.innerHTML = `<span>Ya hay: <b>${esc(actual)}</b></span>`;
      const bt = document.createElement("button"); bt.type = "button"; bt.className = "vz-btn"; bt.textContent = "Reemplazar";
      bt.addEventListener("click", () => { instantanea(); const r = setCampo(p.campo, p.valor, { reemplazar: true }); tag.innerHTML = r.ok ? "<em>✔ reemplazado</em>" : "no se pudo"; verCambio(); });
      tag.appendChild(bt);
    }
    if (f.aviso && !tag.innerHTML.includes("⚠")) tag.innerHTML += `<span style="color:#ffd166">⚠ ${esc(f.aviso)}</span>`;
    filas.push(fila);
  });
  verCambio();
  ["nit", "telefono", "direccion", "correo", "razon", "celular"].forEach(o => { if (obj.has(o) && !prop.some(p => ({ nit: "nit", razon: "cliente", telefono: "telefono", celular: "whatsapp", direccion: "direccion", correo: "correo" }[o]) === p.campo)) faltan.push(ETQ_OBJ[o]); });
  card.className = "vz-it " + (filas.length ? "ok" : "warn");
  card.innerHTML = `<h4>🔎 ${esc(res.nombre_comercial || res.razon_social || entidad)}${res.confianza ? ` <span class="vz-badge ${res.confianza === "alta" ? "ia" : ""}">confianza ${esc(res.confianza)}</span>` : ""}</h4>`;
  filas.forEach(f => card.appendChild(f));
  if (faltan.length) { const d = document.createElement("div"); d.className = "vz-src"; d.innerHTML = "No encontré: <b>" + esc(Array.from(new Set(faltan)).join(", ")) + "</b>."; card.appendChild(d); if (faltan.some(x => /NIT/.test(x))) card.insertAdjacentHTML("beforeend", enlacesManual(entidad, ciudad) + (iaActiva() ? "" : '<div class="vz-src">Para que la IA busque el NIT en internet por usted, active la clave en ⚙.</div>')); }
  if (res.notas || nota) { const d = document.createElement("div"); d.className = "vz-src"; d.textContent = (nota || "") + (res.notas || ""); card.appendChild(d); }
  if (res.fuentes && res.fuentes.length) { const d = document.createElement("div"); d.className = "vz-src"; d.innerHTML = "Fuentes: " + res.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc((f.titulo || f.url).slice(0, 60))}</a>`).join(" · "); card.appendChild(d); }
  const v = document.createElement("div"); v.className = "vz-src"; v.textContent = "Motor: " + (res.motor || "") + ". Verifique estos datos antes de enviar la cotización."; card.appendChild(v);
  decir(filas.length ? "Encontré datos y los llené en el formato" : "No encontré datos concluyentes");
}

/* ---------- Ajustes de IA ---------- */
function pintarCfg() {
  const c = $("vzCfg");
  c.innerHTML = `
    <div class="nota"><b>Motor de IA con búsqueda en internet.</b> Con una clave de la API de Claude el asistente entiende dictados complejos y busca NIT, razón social, teléfono y dirección en internet. Sin clave funciona el motor local (sin búsqueda de NIT).</div>
    <label>Clave de API de Claude (se guarda solo en este dispositivo)<input id="vzKey" type="password" placeholder="sk-ant-…" autocomplete="off" value="${esc(ia.key)}"></label>
    <label>Modelo<select id="vzModelo">${MODELOS.map(m => `<option value="${m[0]}"${m[0] === ia.modelo ? " selected" : ""}>${esc(m[1])}</option>`).join("")}</select></label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="vzNlu"${ia.nlu ? " checked" : ""}> Usar la IA también para interpretar lo que dicto</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="vz-btn" id="vzGuardar" type="button">Guardar</button><button class="vz-btn" id="vzProbar" type="button">Probar conexión</button><button class="vz-btn" id="vzBorrarKey" type="button">Borrar clave</button><a class="vz-btn" target="_blank" rel="noopener" href="https://console.anthropic.com/settings/keys">Obtener clave</a></div>
    <div class="nota" id="vzCfgMsg">Cada consulta usa crédito de su cuenta de la API. La clave nunca se envía a otro lugar que no sea api.anthropic.com. No la comparta ni use esta app en dispositivos ajenos.</div>`;
  const msg = t => { $("vzCfgMsg").textContent = t; };
  const leer = () => { ia.key = $("vzKey").value.trim(); ia.modelo = $("vzModelo").value; ia.nlu = $("vzNlu").checked; guardarIA(); actualizarBadge(); };
  $("vzGuardar").onclick = () => { leer(); msg(iaActiva() ? "✔ Guardado. IA activa." : "Guardado. Sin clave se usa el motor local."); };
  $("vzBorrarKey").onclick = () => { $("vzKey").value = ""; leer(); msg("Clave borrada de este dispositivo."); };
  $("vzProbar").onclick = async () => { leer(); if (!iaActiva()) { msg("Escriba primero la clave."); return; } msg("Probando…"); try { await llamarClaude({ system: "Responde solo: OK", user: "ping", maxTokens: 16, timeoutMs: 20000 }); msg("✔ Conexión correcta: la IA está lista."); } catch (e) { msg("✖ " + (e.message || e)); } };
}

/* ===================== 9. Arranque ===================== */
function iniciarUI() {
  construirUI();
  window.solvexVoz = { nativo, analizar: (t, c) => analizarLocal(t, c || {}), procesar: finalChunk, abrir, cerrar, aplicar: aplicarPlan, _t: { norm, titulo, extraerDigitos, primerNumero, formatoNit, formatoTel, formatoCelular, formatoCorreo, formatoDireccion, formatoFecha, formatoLugar, dvNit, objetosJson, limpiarEntidad, setCampo, ejecutar, procesarAsync: procesar, buscarOSM, ia, ctx } };
  window.__solvexApplyVoiceTranscript = finalChunk; /* compatibilidad con APK anteriores */
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarUI); else iniciarUI();
})();
