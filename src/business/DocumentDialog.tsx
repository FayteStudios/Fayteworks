import { useEffect, useRef, useState } from "react";
import { money, totals } from "../blocks/business";
import { useEditor } from "../state/store";
import { Icon } from "../editor/icons";
import { createInvoice, createProposal, defaultBusiness, packagesFromSite, type BusinessInfo, type Client, type LineItem } from "./documents";

export const OPEN_DOCUMENT = "fayteworks:open-document";
export const openDocument = (kind: "invoice" | "proposal") => window.dispatchEvent(new CustomEvent(OPEN_DOCUMENT, { detail: kind }));

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export function DocumentDialog({ kind: initialKind, onClose }: { kind: "invoice" | "proposal"; onClose: () => void }) {
  const { state, commit, setPage } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState(initialKind);
  const [me, setMe] = useState<BusinessInfo>(() => defaultBusiness(state.site));
  const [client, setClient] = useState<Client>({ name: "", email: "", address: "" });
  const packages = packagesFromSite(state.site);
  const [items, setItems] = useState<LineItem[]>(() => (packages.length ? [packages[0]] : [{ description: "Website design and build", qty: 1, price: 0 }]));
  const [number, setNumber] = useState(() => String(defaultBusiness(state.site).nextInvoice).padStart(4, "0"));
  const [issued, setIssued] = useState(today());
  const [due, setDue] = useState(inDays(14));
  const [notes, setNotes] = useState("Thank you for your business!");
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("Thanks for the chat! Here's what I'd build for you, what it costs, and how long it takes.");
  const [included, setIncluded] = useState("A custom design that fits your brand\nUp to 5 pages, fast on every phone\nContact form and search engine basics\nTwo rounds of changes\nA walkthrough so you can edit it yourself");
  const [timeline, setTimeline] = useState("Week 1: talk and first design\nWeek 2: pages built, your feedback\nWeek 3: changes, testing and launch");
  const [needsMe, setNeedsMe] = useState(!state.site.business?.name);
  const [step, setStep] = useState(0);
  useEffect(() => ref.current?.showModal(), []);

  const t = totals(items, me.taxRate);
  const setItem = (i: number, patch: Partial<LineItem>) => setItems(items.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  function create() {
    const page =
      kind === "invoice"
        ? createInvoice(state.site, me, client, items, { number, issued, due, notes })
        : createProposal(state.site, me, client, items, { title, intro, included, timeline, date: today() });
    commit((d) => {
      d.pages.push(page);
      d.business = { ...me, nextInvoice: kind === "invoice" ? (Number(number) || me.nextInvoice) + 1 : me.nextInvoice };
    });
    setPage(page.id);
    onClose();
  }

  const input = (label: string, value: string, set: (v: string) => void, opts: { type?: string; placeholder?: string; area?: boolean } = {}) => (
    <label className="field">
      <span className="field-label">{label}</span>
      {opts.area ? <textarea rows={3} value={value} placeholder={opts.placeholder} onChange={(e) => set(e.target.value)} /> : <input type={opts.type ?? "text"} value={value} placeholder={opts.placeholder} onChange={(e) => set(e.target.value)} />}
    </label>
  );

  const steps = [...(needsMe ? ["Your details"] : []), "Client", kind === "invoice" ? "Items" : "Price"];
  const at = Math.min(step, steps.length - 1);
  const current = steps[at];
  const clientReady = Boolean(client.name.trim());

  return (
    <dialog ref={ref} className="dialog wizard wizard--wide document-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <div className="segmented document-kind" role="tablist">
          <button role="tab" aria-selected={kind === "invoice"} className={kind === "invoice" ? "is-active" : ""} onClick={() => setKind("invoice")}>
            Invoice
          </button>
          <button role="tab" aria-selected={kind === "proposal"} className={kind === "proposal" ? "is-active" : ""} onClick={() => setKind("proposal")}>
            Proposal
          </button>
        </div>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <ol className="steps">
        {steps.map((label, i) => (
          <li key={label} className={i < at ? "is-done" : i === at ? "is-current" : undefined}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {current === "Your details" && (
        <div className="document-step">
          <p className="dialog-lead">These go on every {kind}, and are kept for next time.</p>
          <div className="document-grid">
            <section>
              {input("Your business name", me.name, (v) => setMe({ ...me, name: v }))}
              {input("Your email", me.email, (v) => setMe({ ...me, email: v }))}
              {input("Your address", me.address, (v) => setMe({ ...me, address: v }), { area: true })}
            </section>
            <section>
              {input("How to pay", me.payment, (v) => setMe({ ...me, payment: v }), { area: true, placeholder: "Bank transfer to … or pay by card with the button" })}
              {input("Payment link (optional)", me.paymentLink, (v) => setMe({ ...me, paymentLink: v.trim() }), { placeholder: "https://buy.stripe.com/…" })}
              <div className="field-row">
                {input("Currency sign", me.currency, (v) => setMe({ ...me, currency: v }))}
                {input("Tax %", String(me.taxRate), (v) => setMe({ ...me, taxRate: Math.max(0, Number(v) || 0) }), { type: "number" })}
                {input("Tax name", me.taxLabel, (v) => setMe({ ...me, taxLabel: v }))}
              </div>
              <label className="field">
                <span className="field-label">Paper</span>
                <select value={me.paper} onChange={(e) => setMe({ ...me, paper: e.target.value as BusinessInfo["paper"] })}>
                  <option value="letter">US Letter</option>
                  <option value="a4">A4</option>
                </select>
              </label>
            </section>
          </div>
        </div>
      )}

      {current === "Client" && (
        <div className="document-grid document-step">
          <section>
            {input("Client name or business", client.name, (v) => setClient({ ...client, name: v }))}
            {input("Their email", client.email, (v) => setClient({ ...client, email: v }), { type: "email" })}
            {input("Their address (optional)", client.address, (v) => setClient({ ...client, address: v }), { area: true })}
          </section>
          <section>
            {kind === "invoice" ? (
              <>
                {input("Invoice number", number, setNumber)}
                <div className="field-row">
                  {input("Issued", issued, setIssued, { type: "date" })}
                  {input("Due", due, setDue, { type: "date" })}
                </div>
                {input("Note at the bottom", notes, setNotes)}
              </>
            ) : (
              <>
                {input("Title", title, setTitle, { placeholder: `A website for ${client.name || "you"}` })}
                {input("Opening words", intro, setIntro, { area: true })}
                {input("What's included (one per line)", included, setIncluded, { area: true })}
                {input("Timeline (one step per line)", timeline, setTimeline, { area: true })}
              </>
            )}
          </section>
        </div>
      )}

      {(current === "Items" || current === "Price") && (
        <div className="document-step">
          <div className="document-items">
            <div className="document-item document-item--head">
              <span>What</span>
              <span>How many</span>
              <span>Price each</span>
              <span />
            </div>
            {items.map((item, i) => (
              <div key={i} className="document-item">
                <input aria-label="Description" value={item.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                <input aria-label="Quantity" type="number" min={0} value={item.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
                <input aria-label="Price" type="number" min={0} step="0.01" value={item.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} />
                <button className="icon-button" aria-label="Remove" onClick={() => setItems(items.filter((_, n) => n !== i))}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="field-row">
            <button className="btn btn--small" onClick={() => setItems([...items, { description: "", qty: 1, price: 0 }])}>
              + Line
            </button>
            {packages.length > 0 && (
              <select aria-label="Add one of your packages" value="" onChange={(e) => e.target.value && setItems([...items, packages[Number(e.target.value)]])}>
                <option value="">+ One of your packages…</option>
                {packages.map((p, i) => (
                  <option key={i} value={i}>
                    {p.description} · {money(p.price, me.currency)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="document-total">
            {me.taxRate > 0 && `${money(t.subtotal, me.currency)} + ${me.taxLabel} ${money(t.tax, me.currency)} = `}
            <strong>{money(t.total, me.currency)}</strong>
          </p>
          {!needsMe && (
            <button className="link-button" onClick={() => (setNeedsMe(true), setStep(0))}>
              Change your details ({me.name || "not set"})
            </button>
          )}
        </div>
      )}

      <footer className="wizard-actions">
        {at > 0 ? (
          <button className="btn" onClick={() => setStep(at - 1)}>
            Back
          </button>
        ) : (
          <span className="field-hint">It opens as a design you can adjust, then export as a PDF.</span>
        )}
        {at < steps.length - 1 ? (
          <button className="btn btn--primary" disabled={current === "Client" && !clientReady} onClick={() => setStep(at + 1)}>
            Next
          </button>
        ) : (
          <button className="btn btn--primary" disabled={!items.length} onClick={create}>
            Make the {kind}
          </button>
        )}
      </footer>
    </dialog>
  );
}
