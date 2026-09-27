const WORDS: Record<string, string> = {
  i: "I",
  im: "I’m",
  ive: "I’ve",
  dont: "don’t",
  doesnt: "doesn’t",
  didnt: "didn’t",
  cant: "can’t",
  wont: "won’t",
  isnt: "isn’t",
  arent: "aren’t",
  wasnt: "wasn’t",
  werent: "weren’t",
  havent: "haven’t",
  hasnt: "hasn’t",
  couldnt: "couldn’t",
  shouldnt: "shouldn’t",
  wouldnt: "wouldn’t",
  thats: "that’s",
  theres: "there’s",
  youre: "you’re",
  theyre: "they’re",
  teh: "the",
  hte: "the",
  adn: "and",
  nad: "and",
  taht: "that",
  thier: "their",
  recieve: "receive",
  recieved: "received",
  beleive: "believe",
  acheive: "achieve",
  wierd: "weird",
  freind: "friend",
  freinds: "friends",
  untill: "until",
  occured: "occurred",
  seperate: "separate",
  definately: "definitely",
  alot: "a lot",
  becuase: "because",
  becasue: "because",
  wich: "which",
  whcih: "which",
  realy: "really",
  tommorow: "tomorrow",
  tomorow: "tomorrow",
  accomodate: "accommodate",
  begining: "beginning",
  goverment: "government",
  enviroment: "environment",
  existance: "existence",
  neccessary: "necessary",
  necesary: "necessary",
  occassion: "occasion",
  publically: "publicly",
  succesful: "successful",
  sucessful: "successful",
  truely: "truly",
  wether: "whether",
  writting: "writing",
  youve: "you’ve",
  theyve: "they’ve",
  weve: "we’ve",
  whats: "what’s"
};

const BOUNDARY = /[\s.,!?;:)]/;

export interface Correction {
  text: string;
  caret: number;
  undo: { text: string; caret: number };
}

function inCode(text: string, at: number) {
  const before = text.slice(0, at);
  if ((before.match(/^```/gm)?.length ?? 0) % 2 === 1) return true;
  const line = before.slice(before.lastIndexOf("\n") + 1);
  if ((line.match(/`/g)?.length ?? 0) % 2 === 1) return true;
  return /\]\([^)\s]*$|<[^>]*$|\S*:\/\/\S*$/.test(line);
}

function keepCase(from: string, to: string) {
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

export function autocorrect(prev: string, next: string, caret: number): Correction | null {
  if (next.length !== prev.length + 1 || caret < 1) return null;
  if (next.slice(0, caret - 1) + next.slice(caret) !== prev) return null;
  if (inCode(next, caret - 1)) return null;
  const typed = next[caret - 1];
  const undo = { text: next, caret };
  const swap = (start: number, end: number, value: string): Correction => ({ text: next.slice(0, start) + value + next.slice(end), caret: caret - (end - start) + value.length, undo });

  if (typed === '"' || typed === "'") {
    const before = next[caret - 2] ?? "";
    const opening = !before || /[\s([{—-]/.test(before);
    const quote = typed === '"' ? (opening ? "“" : "”") : opening ? "‘" : "’";
    return swap(caret - 1, caret, quote);
  }
  if (typed === " " && next.slice(caret - 4, caret) === " -- ") return swap(caret - 3, caret - 1, "—");
  if (typed === "." && next.slice(caret - 3, caret) === "..." && next[caret - 4] !== ".") return swap(caret - 3, caret, "…");

  if (!BOUNDARY.test(typed)) return null;
  const match = /(^|[\s(“‘"'*_])([A-Za-z]+)$/.exec(next.slice(0, caret - 1));
  if (!match) return null;
  const word = match[2];
  const fix = WORDS[word.toLowerCase()];
  if (!fix || fix === word) return null;
  const start = caret - 1 - word.length;
  return swap(start, caret - 1, word.toLowerCase() === "i" ? "I" : keepCase(word, fix));
}

const KEY = "fayteworks:autocorrect";

export function autocorrectOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutocorrectOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    return;
  }
}
