// ============================================================
//  AHDEM Oylama — ortak yardımcılar
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";

export { CONFIG };

/** Ayar dosyası doldurulmuş mu? */
export function configReady() {
  return (
    String(CONFIG.supabaseUrl).startsWith("http") &&
    String(CONFIG.supabaseAnonKey).length > 20
  );
}

// Divan oturumu ile vekil oturumu ayrı kutularda tutulur.
// Aksi halde aynı tarayıcıda divan şifresiyle giriş yapmak, o tarayıcıdaki
// vekil kimliğini siler; ya da divan hesabı yanlışlıkla vekil olarak kaydolur.
const ROL = location.pathname.endsWith("divan.html") ? "divan" : "vekil";

// Ayarlar boşken de sayfa açılabilsin diye geçici adres kullanılır;
// bu durumda ekrana "kurulum tamamlanmamış" uyarısı basılır.
export const sb = createClient(
  configReady() ? CONFIG.supabaseUrl : "https://kurulmadi.supabase.co",
  configReady() ? CONFIG.supabaseAnonKey : "kurulmadi",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "ahdem-oylama-" + ROL,
    },
  }
);

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** "  Ahmet   YILMAZ " -> "ahmet yilmaz"  (mükerrer isim kilidi için) */
export function normalizeName(s) {
  return String(s)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\s]/gu, "");
}

/** "ahmet yılmaz" -> "Ahmet Yılmaz" */
export function titleCase(s) {
  return String(s)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1).toLocaleLowerCase("tr"))
    .join(" ");
}

/** Vekil / yansıtma ekranı için anonim oturum açar. */
export async function ensureAnonSession() {
  let { data } = await sb.auth.getSession();
  if (!data.session) {
    const { error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    ({ data } = await sb.auth.getSession());
  }
  if (data.session) sb.realtime.setAuth(data.session.access_token);
  return data.session;
}

/** Şu an açık olan oylama (yoksa null). */
export async function getActivePoll() {
  const { data, error } = await sb
    .from("polls")
    .select("*")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/** En son kapanan oylama (perdede sonucu göstermeye devam etmek için). */
export async function getLastClosedPoll() {
  const { data, error } = await sb
    .from("polls")
    .select("*")
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/** Bir oylamanın seçenek bazında oy sayıları -> [3, 1, 0] */
export async function getTally(pollId, optionCount) {
  const { data, error } = await sb
    .from("poll_tally")
    .select("option_index, count")
    .eq("poll_id", pollId);
  if (error) throw error;
  const out = new Array(optionCount).fill(0);
  for (const r of data) if (r.option_index < optionCount) out[r.option_index] = r.count;
  return out;
}

/** Salona kayıtlı toplam vekil sayısı */
export async function getVoterCount() {
  const { count, error } = await sb
    .from("voters")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Oy kullanmış vekiller (ne oy verdikleri görünmez) */
export async function getParticipants(pollId) {
  const { data, error } = await sb
    .from("poll_participants")
    .select("voter_id, full_name, updated_at")
    .eq("poll_id", pollId)
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Bir tabloyu canlı dinle. */
export function listen(name, table, cb, filter = null) {
  const ch = sb.channel(name).on(
    "postgres_changes",
    { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
    cb
  );
  ch.subscribe();
  return ch;
}

/** Yüzde hesabı (0 oy varken 0 döner). */
export function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Excel'in doğrudan açtığı CSV indirir.
 * UTF-8 BOM + ";" ayracı -> Türkçe karakterler ve sütunlar düzgün gelir.
 */
export function downloadExcelCsv(filename, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + "sep=;\r\n" + body], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Ayar dosyası boşsa sayfanın tepesine uyarı basar. */
export function warnIfNotConfigured() {
  if (configReady()) return false;
  const div = document.createElement("div");
  div.className = "note error";
  div.style.margin = "16px";
  div.innerHTML =
    "<b>Kurulum tamamlanmamış.</b> <code>assets/config.js</code> dosyasındaki " +
    "Supabase adresi ve anahtarı henüz doldurulmamış.";
  document.body.prepend(div);
  return true;
}

/* ============================================================
   Sonuç grafiği (halka pasta) — divan ve yansıtma ekranı
   Renkler seçeneğin sırasına bağlıdır, oy sırasına değil: "Kabul"
   her zaman aynı renktir. Paletler style.css'te (--s1 … --s5).
   ============================================================ */

/** Pasta en fazla bu kadar seçenekle çizilir; fazlasında çubuklara dönülür. */
export const PASTA_MAX = 5;

/**
 * Seçeneklere göre sonuç görseli döner (HTML metni).
 * gizli=true: dilimler ve sayılar gösterilmez, yalnızca toplam katılım.
 */
export function sonucHtml(options, tally, { gizli = false } = {}) {
  return options.length <= PASTA_MAX
    ? pastaHtml(options, tally, gizli)
    : cubukHtml(options, tally, gizli);
}

function pastaHtml(options, tally, gizli) {
  const toplam = tally.reduce((a, b) => a + b, 0);
  const C = 100, R = 92, r = 58;          // merkez, dış ve iç yarıçap
  const nokta = (yc, a) => `${(C + yc * Math.cos(a)).toFixed(2)} ${(C + yc * Math.sin(a)).toFixed(2)}`;
  let dilimler = "";

  if (!gizli && toplam > 0) {
    let aci = -Math.PI / 2;               // saat 12'den başla
    tally.forEach((n, i) => {
      if (!n) return;
      const baslik = `<title>${esc(options[i])}: ${n} oy (%${pct(n, toplam)})</title>`;
      if (n === toplam) {                 // tek seçenek her şeyi aldıysa tam halka
        dilimler += `<circle class="dilim" data-i="${i}" cx="${C}" cy="${C}" r="${(R + r) / 2}"
                      fill="none" stroke="var(--s${i + 1})" stroke-width="${R - r}">${baslik}</circle>`;
        return;
      }
      const a0 = aci, a1 = aci + (n / toplam) * 2 * Math.PI;
      aci = a1;
      const buyuk = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M ${nokta(R, a0)} A ${R} ${R} 0 ${buyuk} 1 ${nokta(R, a1)}
                 L ${nokta(r, a1)} A ${r} ${r} 0 ${buyuk} 0 ${nokta(r, a0)} Z`;
      dilimler += `<path class="dilim" data-i="${i}" d="${d}" fill="var(--s${i + 1})">${baslik}</path>`;
    });
  } else {
    dilimler = `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none"
                  stroke="var(--viz-track)" stroke-width="${R - r}"/>`;
  }

  const altYazi = gizli ? "oy kullanıldı" : toplam > 0 ? "toplam oy" : "henüz oy yok";

  return `
    <div class="pasta ${gizli ? "gizli" : ""}" data-n="${options.length}">
      <svg viewBox="0 0 200 200" role="img" aria-label="Oylama sonucu grafiği">
        ${dilimler}
        <text x="${C}" y="${C + 4}" class="merkez-sayi" text-anchor="middle">${toplam}</text>
        <text x="${C}" y="${C + 24}" class="merkez-yazi" text-anchor="middle">${altYazi}</text>
      </svg>
      <ul class="lejant">
        ${options.map((o, i) => `
          <li data-i="${i}">
            <span class="renk" style="background:var(--s${i + 1})"></span>
            <span class="ad">${esc(o)}</span>
            <span class="sayi">${gizli ? "—" : tally[i]}</span>
            <span class="yuzde">${gizli ? "" : "%" + pct(tally[i], toplam)}</span>
          </li>`).join("")}
      </ul>
    </div>`;
}

function cubukHtml(options, tally, gizli) {
  const toplam = tally.reduce((a, b) => a + b, 0);
  return `
    <div class="tally">
      ${options.map((o, i) => `
        <div class="tally-row">
          <div class="tally-head">
            <span>${esc(o)}</span>
            <span class="n">${gizli ? "—" : `${tally[i]} oy · %${pct(tally[i], toplam)}`}</span>
          </div>
          <div class="bar"><span style="width:${gizli ? 0 : pct(tally[i], toplam)}%"></span></div>
        </div>`).join("")}
    </div>`;
}

/** Dilim ile lejant satırını birbirine bağlar: biri üzerine gelince ikisi de öne çıkar. */
export function pastaEtkilesim(kok) {
  const isaretle = (i) => {
    kok.querySelectorAll(".pasta").forEach((p) => {
      p.classList.toggle("odak", i !== null);
      p.querySelectorAll("[data-i]").forEach((el) =>
        el.classList.toggle("aktif", el.dataset.i === i));
    });
  };
  kok.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".pasta [data-i]");
    isaretle(el ? el.dataset.i : null);
  });
  kok.addEventListener("mouseleave", () => isaretle(null));
}
