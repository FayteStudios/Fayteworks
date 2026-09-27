import { createBlock } from "../model/factory";
import { createDesignPage, DESIGN_PRESETS } from "../model/design";
import type { Block, BlockProps, ListItem, Page, Site } from "../model/types";

export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
  payment: string;
  paymentLink: string;
  currency: string;
  taxRate: number;
  taxLabel: string;
  nextInvoice: number;
  paper: "a4" | "letter";
}

export interface Client {
  name: string;
  email: string;
  address: string;
}

export interface LineItem {
  description: string;
  qty: number;
  price: number;
}

export function defaultBusiness(site: Site): BusinessInfo {
  return {
    name: site.name,
    email: "",
    address: "",
    payment: "",
    paymentLink: "",
    currency: "$",
    taxRate: 0,
    taxLabel: "Tax",
    nextInvoice: 1,
    paper: "letter",
    ...site.business
  };
}

export function packagesFromSite(site: Site): LineItem[] {
  const out: LineItem[] = [];
  for (const page of site.pages)
    for (const section of page.sections)
      for (const b of section.blocks) {
        if (b.type !== "pricing") continue;
        const price = Number(String(b.props.price ?? "").replace(/[^\d.]/g, ""));
        if (!Number.isFinite(price) || price <= 0) continue;
        const name = String(b.props.plan ?? "Package");
        if (!out.some((i) => i.description === name)) out.push({ description: `${name}${b.props.description ? `: ${String(b.props.description).replace(/\.$/, "")}` : ""}`, qty: 1, price });
      }
  return out;
}

const b = (type: string, x: number, y: number, w: number, h: number, props: BlockProps): Block => createBlock(type, { x, y, w, h }, props);
const dateText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const lines = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join("\n");
const preset = (paper: BusinessInfo["paper"], sheets = 1) => ({ ...DESIGN_PRESETS.find((p) => p.id === (paper === "a4" ? "a4-document" : "letter-document"))!, sheets });

export function createInvoice(site: Site, me: BusinessInfo, client: Client, items: LineItem[], opts: { number: string; issued: string; due: string; notes: string }): Page {
  const page = createDesignPage(site, preset(me.paper), `Invoice ${opts.number}${client.name ? ` · ${client.name}` : ""}`);
  const sheet = page.sections[0];
  const blocks: Block[] = [
    b("heading", 0, 0, 6, 4, { text: "Invoice", level: "1", size: "xl" }),
    b("text", 7, 0, 5, 6, { text: lines(`**${me.name}**`, me.address, me.email), align: "right", size: "s" }),
    b("text", 0, 5, 6, 4, { text: lines(`**Invoice** ${opts.number}`, `**Issued** ${dateText(opts.issued)}`, `**Due** ${dateText(opts.due)}`), size: "s" }),
    b("heading", 0, 10, 6, 2, { text: "Billed to", level: "3", size: "s", color: "var(--muted)" }),
    b("text", 0, 12, 6, 4, { text: lines(`**${client.name || "Client name"}**`, client.address, client.email), size: "s" }),
    b("lineitems", 0, 17, 12, 4 + items.length * 2, { items: items.map((i) => ({ ...i })) as unknown as ListItem[], currency: me.currency, taxRate: me.taxRate, taxLabel: me.taxLabel, showQty: true })
  ];
  let y = 22 + items.length * 2 + 4;
  blocks.push(b("heading", 0, y, 7, 2, { text: "How to pay", level: "3", size: "s" }));
  blocks.push(b("text", 0, y + 2, 7, 5, { text: me.payment || "Add your payment details (bank transfer, card link…) in the invoice settings.", size: "s" }));
  if (/^https:\/\//.test(me.paymentLink)) blocks.push(b("button", 8, y + 2, 4, 3, { label: "Pay online", href: me.paymentLink, align: "right", size: "m" }));
  y += 9;
  blocks.push(b("text", 0, y, 12, 3, { text: opts.notes || "Thank you for your business!", size: "s", color: "var(--muted)" }));
  sheet.blocks = blocks.map((block) => ({ ...block, layerId: sheet.layers[0].id }));
  return page;
}

export function createProposal(site: Site, me: BusinessInfo, client: Client, items: LineItem[], opts: { title: string; intro: string; included: string; timeline: string; date: string }): Page {
  const page = createDesignPage(site, preset(me.paper, 2), `Proposal · ${client.name || "Client"}`);
  const [cover, inside] = page.sections;
  cover.name = "Cover";
  inside.name = "Details";
  const coverRows = cover.settings.minRows;
  cover.blocks = [
    b("text", 0, 0, 12, 2, { text: `**${me.name}**`, size: "s", color: "var(--muted)" }),
    b("heading", 0, Math.round(coverRows * 0.35), 12, 8, { text: opts.title || `A website for ${client.name || "you"}`, level: "1", size: "display" }),
    b("text", 0, Math.round(coverRows * 0.35) + 9, 10, 3, { text: `Proposal for ${client.name || "Client"} · ${dateText(opts.date)}`, size: "l", color: "var(--muted)" }),
    b("text", 0, coverRows - 4, 12, 3, { text: lines(me.email, me.address.replace(/\n/g, " · ")), size: "s", color: "var(--muted)" })
  ].map((block) => ({ ...block, layerId: cover.layers[0].id }));
  let y = 0;
  const blocks: Block[] = [];
  const sectionHeading = (text: string) => {
    blocks.push(b("heading", 0, y, 12, 3, { text, level: "2", size: "m" }));
    y += 3;
  };
  if (opts.intro.trim()) {
    blocks.push(b("text", 0, y, 12, 5, { text: opts.intro, size: "m" }));
    y += 6;
  }
  sectionHeading("What's included");
  blocks.push(b("list", 0, y, 12, Math.max(3, opts.included.split("\n").length * 2), { items: opts.included, style: "ticks", size: "s" }));
  y += Math.max(3, opts.included.split("\n").length * 2) + 1;
  sectionHeading("Investment");
  blocks.push(b("lineitems", 0, y, 12, 4 + items.length * 2, { items: items.map((i) => ({ ...i })) as unknown as ListItem[], currency: me.currency, taxRate: me.taxRate, taxLabel: me.taxLabel, showQty: false }));
  y += 5 + items.length * 2 + 1;
  sectionHeading("Timeline");
  blocks.push(b("list", 0, y, 12, Math.max(3, opts.timeline.split("\n").length * 2), { items: opts.timeline, style: "numbers", size: "s" }));
  y += Math.max(3, opts.timeline.split("\n").length * 2) + 1;
  sectionHeading("To go ahead");
  blocks.push(b("text", 0, y, 12, 4, { text: `Reply to this proposal${me.email ? ` at ${me.email}` : ""} to accept. A 50% deposit starts the work; the rest is due at launch. This proposal is valid for 30 days.`, size: "s" }));
  y += 5;
  blocks.push(b("text", 0, y, 6, 4, { text: "Accepted by (name and date)\n\n________________________________", size: "s" }));
  blocks.push(b("text", 6, y, 6, 4, { text: `For ${me.name}\n\n________________________________`, size: "s" }));
  inside.blocks = blocks.map((block) => ({ ...block, layerId: inside.layers[0].id }));
  return page;
}
