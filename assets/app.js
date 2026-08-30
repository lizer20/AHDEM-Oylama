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

// Ayarlar boşken de sayfa açılabilsin diye geçici adres kullanılır;
// bu durumda ekrana "kurulum tamamlanmamış" uyarısı basılır.
export const sb = createClient(
  configReady() ? CONFIG.supabaseUrl : "https://kurulmadi.supabase.co",
  configReady() ? CONFIG.supabaseAnonKey : "kurulmadi",
  { auth: { persistSession: true, autoRefreshToken: true } }
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
