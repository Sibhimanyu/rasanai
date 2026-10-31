// Text QA for the FINAL index.html (R6: one favourite shipped "excatly", "does't" and "7-days" next to "seven-day").
// A small heuristic, no network: visible text is pulled from the composition (scripts, styles, comments and attributes dropped), then
//   errors   a doubled word ("the the"), a known common typo, a contraction missing its apostrophe ("does't", "dont", "cant"), a stray space before punctuation
//            ("word ,"), a number-word mismatch inside one film ("7-day" and "seven-day")
//   warnings a long lowercase word that is in no dictionary (the system word list when there is one, a built-in list otherwise), brand and proper names excepted
// The final gate blocks on errors only.
//   textQa(html, { allow: ["Rasan"] }) -> { ok, words, errors: [{kind, word, context}], warnings: [...] }
import fs from "node:fs";

export const TYPOS = {
  excatly: "exactly", exacly: "exactly", teh: "the", recieve: "receive", recieved: "received", seperate: "separate", seperately: "separately", definately: "definitely", definatly: "definitely",
  occured: "occurred", occurence: "occurrence", untill: "until", wich: "which", whcih: "which", becuase: "because", beacuse: "because", adress: "address", acheive: "achieve", achive: "achieve",
  accomodate: "accommodate", enviroment: "environment", goverment: "government", independant: "independent", tommorow: "tomorrow", tomorow: "tomorrow", thier: "their", freind: "friend",
  beleive: "believe", wierd: "weird", writting: "writing", begining: "beginning", calender: "calendar", commited: "committed", comming: "coming", diffrent: "different", embarass: "embarrass",
  existance: "existence", foriegn: "foreign", fourty: "forty", gaurd: "guard", happend: "happened", immediatly: "immediately", knowlege: "knowledge", lenght: "length", libary: "library",
  mispell: "misspell", neccessary: "necessary", necesary: "necessary", noticable: "noticeable", occassion: "occasion", persistant: "persistent", posession: "possession", prefered: "preferred",
  publically: "publicly", realy: "really", relevent: "relevant", reccomend: "recommend", recomend: "recommend", refering: "referring", sucess: "success", succesful: "successful", suprise: "surprise",
  tounge: "tongue", truely: "truly", unfortunatly: "unfortunately", usefull: "useful", vaccum: "vacuum", wether: "whether", workflwo: "workflow", wokflow: "workflow", automaticaly: "automatically",
  anwser: "answer", alot: "a lot", seemless: "seamless", intergrate: "integrate", dashbaord: "dashboard", notifcation: "notification", notifcations: "notifications", messsage: "message",
};
const CONTRACTION_STEMS = ["does", "did", "is", "was", "are", "were", "has", "have", "had", "would", "could", "should", "wo", "ca", "do", "ai"];
const NO_APOS = /^(dont|cant|wont|isnt|doesnt|didnt|wasnt|werent|arent|hasnt|havent|hadnt|wouldnt|couldnt|shouldnt|youre|theyre|thats|whats|ive|youve|weve|im)$/i;
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"', "&ndash;": "-", "&mdash;": "-" };
export function visibleText(html) {
  const body = String(html || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<(svg|defs|noscript)[\s\S]*?<\/\1>/gi, " ");
  // block-ish tags are separators so two elements never run into one word; inline spans stay joined only when no whitespace was between them
  const chunks = body.split(/<[^>]*>/).map((t) => t.replace(/&#?\w+;/g, (m) => ENT[m] ?? " ").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim()).filter(Boolean);
  return chunks;
}

let DICT = null;
function dict() {
  if (DICT) return DICT;
  DICT = new Set();
  for (const f of ["/usr/share/dict/words", "/usr/share/dict/web2"]) { try { for (const w of fs.readFileSync(f, "utf8").split("\n")) DICT.add(w.toLowerCase()); } catch {} }
  return DICT;
}
const stemOk = (w, D) => {
  if (D.has(w)) return true;
  for (const [a, b] of [["s", ""], ["es", ""], ["ed", ""], ["ed", "e"], ["ing", ""], ["ing", "e"], ["ly", ""], ["ies", "y"], ["er", ""], ["er", "e"], ["est", ""], ["ness", ""], ["ment", ""], ["ments", ""], ["ful", ""], ["ions", "ion"], ["ers", ""]]) if (w.length > a.length + 2 && w.endsWith(a) && D.has(w.slice(0, -a.length) + b)) return true;
  return false;
};

export function textQa(html, { allow = [] } = {}) {
  const chunks = visibleText(html), errors = [], warnings = [];
  const allowSet = new Set(allow.map((a) => String(a).toLowerCase()));
  const D = dict(), haveDict = D.size > 1000;
  let words = 0; const numForms = new Map();
  const ctx = (c, w) => { const i = c.toLowerCase().indexOf(w.toLowerCase()); return c.slice(Math.max(0, i - 20), i + w.length + 20); };
  const seen = new Set();
  const push = (arr, kind, word, c) => { const k = `${kind}|${word.toLowerCase()}|${c}`; if (seen.has(k)) return; seen.add(k); arr.push({ kind, word, context: ctx(c, word) }); };
  for (const c of chunks) {
    const toks = c.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
    words += toks.length;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], lo = t.toLowerCase();
      if (i && lo === toks[i - 1].toLowerCase() && /^\p{L}{2,}$/u.test(t) && !/^(had|that|very|bye|no|so|ha|go|yeah|yes|never|more|knock|long)$/i.test(t)) push(errors, "doubled-word", `${toks[i - 1]} ${t}`, c);
      if (TYPOS[lo]) push(errors, "typo", t, c);
      if (NO_APOS.test(lo) && !/^(im|ive|whats|thats)$/.test(lo)) push(errors, "missing-apostrophe", t, c);
      const m = lo.match(/^([a-z]+)'t$/); if (m && CONTRACTION_STEMS.includes(m[1])) push(errors, "malformed-contraction", t, c);
      const nm = lo.match(/^(\d+|[a-z]+)-(day|days|week|weeks|month|months|year|years|step|steps|minute|minutes|hour|hours)$/);
      if (nm) { const n = /^\d+$/.test(nm[1]) ? +nm[1] : NUMS[nm[1]]; if (n != null) { const form = /^\d+$/.test(nm[1]) ? "digits" : "words"; const k = `${n}-${nm[2].replace(/s$/, "")}`; (numForms.get(k) || numForms.set(k, new Set()).get(k)).add(form); } }
      if (haveDict && /^\p{Ll}{6,}$/u.test(t) && !allowSet.has(lo) && !stemOk(lo, D) && !TYPOS[lo]) push(warnings, "unknown-word", t, c);
    }
    if (/\s[,.;:!?](?!\.)/.test(c) && !/\s\.\.\./.test(c)) { const m = c.match(/\S+\s[,.;:!?]/); if (m) push(errors, "space-before-punctuation", m[0], c); }
  }
  for (const [k, forms] of numForms) if (forms.size > 1) errors.push({ kind: "number-style", word: k, context: `"${k}" is written both with digits and with words in this film: pick one` });
  return { ok: errors.length === 0, words, errors, warnings: warnings.slice(0, 30) };
}
