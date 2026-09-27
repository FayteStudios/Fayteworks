import { useEffect, useRef } from "react";
import type { SiteServices } from "../model/types";
import { useEditor } from "../state/store";
import { ANALYTICS, CRISP_ID, MEMBERSTACK_APP, SNIPCART_KEY, TAWK_PROPERTY, TAWK_WIDGET } from "./siteServices";
import { openGuide } from "../guides/GuideHost";
import { openDirectory } from "../directory/DirectoryDialog";


export function ServicesDialog({ onClose }: { onClose: () => void }) {
  const { state, commit } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const services = state.site.services ?? {};
  useEffect(() => ref.current?.showModal(), []);

  function set(recipe: (s: SiteServices) => void, key: string) {
    commit((draft) => {
      draft.services ??= {};
      recipe(draft.services);
    }, `services.${key}`);
  }

  const analytics = services.analytics;
  const spec = ANALYTICS.find((a) => a.value === analytics?.provider);
  const bad = (value: string | undefined, valid: RegExp) => Boolean(value) && !valid.test(value!);

  return (
    <dialog ref={ref} className="dialog share-dialog services-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Services</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="dialog-lead">
        Payments, sign-ups, accounts and data come from services you sign up to yourself. Your site links to them, so you can switch provider, or move
        your site elsewhere, without rebuilding. Only public ids go here; secret keys stay with the service (or, for data, encrypted in the desktop app).
      </p>

      <div className="share-grid">
        <section className="share-card">
          <h3>Visitor statistics</h3>
          <select aria-label="Analytics" value={analytics?.provider ?? ""} onChange={(e) => set((s) => void (s.analytics = e.target.value ? { provider: e.target.value as NonNullable<SiteServices["analytics"]>["provider"], id: "" } : undefined), "analytics.provider")}>
            <option value="">None</option>
            {ANALYTICS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {analytics && spec && (
            <>
              <input type="text" aria-label={spec.idLabel} placeholder={spec.idLabel} value={analytics.id} onChange={(e) => set((s) => void (s.analytics!.id = e.target.value.trim()), "analytics.id")} />
              {analytics.provider === "umami" && (
                <input type="text" aria-label="Umami script address" placeholder="Self-hosted? Script address (https://…/script.js)" value={analytics.src ?? ""} onChange={(e) => set((s) => void (s.analytics!.src = e.target.value.trim() || undefined), "analytics.src")} />
              )}
              {bad(analytics.id, spec.valid) ? <p className="dialog-status dialog-status--error">That doesn't look like a {spec.idLabel.toLowerCase()}.</p> : <p className="field-hint">{spec.note}</p>}
            </>
          )}
        </section>

        <section className="share-card">
          <h3>Snipcart shop</h3>
          <input type="text" aria-label="Snipcart public API key" placeholder="Public API key (Snipcart → Account → API keys)" value={services.snipcart?.publicKey ?? ""} onChange={(e) => set((s) => void (s.snipcart = e.target.value.trim() ? { ...s.snipcart, publicKey: e.target.value.trim() } : undefined), "snipcart.key")} />
          <input type="text" aria-label="Currency" placeholder="Currency (e.g. usd, eur, gbp)" maxLength={3} value={services.snipcart?.currency ?? ""} disabled={!services.snipcart} onChange={(e) => set((s) => void (s.snipcart!.currency = e.target.value.trim().toLowerCase() || undefined), "snipcart.currency")} />
          {bad(services.snipcart?.publicKey, SNIPCART_KEY) ? (
            <p className="dialog-status dialog-status--error">That doesn't look like a Snipcart public key.</p>
          ) : (
            <p className="field-hint">Loaded only on pages with a Snipcart Buy button or Cart button. Set the site address (page settings) so Snipcart can check prices.</p>
          )}
        </section>

        <section className="share-card">
          <h3>Live chat</h3>
          <select aria-label="Chat" value={services.chat?.provider ?? ""} onChange={(e) => set((s) => void (s.chat = e.target.value ? { provider: e.target.value as "crisp" | "tawk", id: "" } : undefined), "chat.provider")}>
            <option value="">None</option>
            <option value="crisp">Crisp</option>
            <option value="tawk">Tawk.to</option>
          </select>
          {services.chat && (
            <>
              <input
                type="text"
                aria-label={services.chat.provider === "crisp" ? "Crisp website id" : "Tawk.to property id"}
                placeholder={services.chat.provider === "crisp" ? "Website ID (Settings → Website settings → Setup)" : "Property ID (Administration → Chat widget)"}
                value={services.chat.id}
                onChange={(e) => set((s) => void (s.chat!.id = e.target.value.trim()), "chat.id")}
              />
              {services.chat.provider === "tawk" && (
                <input type="text" aria-label="Tawk.to widget id" placeholder="Widget ID (usually “default”)" value={services.chat.widget ?? ""} onChange={(e) => set((s) => void (s.chat!.widget = e.target.value.trim() || undefined), "chat.widget")} />
              )}
              {bad(services.chat.id, services.chat.provider === "crisp" ? CRISP_ID : TAWK_PROPERTY) || bad(services.chat.widget, TAWK_WIDGET) ? (
                <p className="dialog-status dialog-status--error">That doesn't look like a {services.chat.provider === "crisp" ? "Crisp website id" : "Tawk.to id"}.</p>
              ) : (
                <p className="field-hint">
                  A chat bubble on every page; you answer from the service's app on your phone or computer.{" "}
                  <button className="link-button" onClick={() => (onClose(), openGuide("live-chat"))}>
                    Guide →
                  </button>
                </p>
              )}
            </>
          )}
        </section>

        <section className="share-card">
          <h3>Memberstack members</h3>
          <input type="text" aria-label="Memberstack app id" placeholder="App id (app_…)" value={services.memberstack?.appId ?? ""} onChange={(e) => set((s) => void (s.memberstack = e.target.value.trim() ? { appId: e.target.value.trim() } : undefined), "memberstack")} />
          {bad(services.memberstack?.appId, MEMBERSTACK_APP) ? (
            <p className="dialog-status dialog-status--error">That doesn't look like a Memberstack app id.</p>
          ) : (
            <p className="field-hint">
              Loaded on pages with a Sign in / account block. Members-only sections are hidden in the browser, but their content is still in the page:
              keep anything truly private (files, paid downloads) with the provider.
            </p>
          )}
        </section>
      </div>

      <h3 className="panel-heading services-directory-heading">Where to find what</h3>
      <p className="field-hint">
        Payments, shops, newsletters, sign-in, data, tips and memberships (and print shops and merch makers too), with what each is good for and where it plugs in here.{" "}
        <button className="link-button" onClick={() => (onClose(), openDirectory("payments"))}>
          Open the directory →
        </button>
      </p>
    </dialog>
  );
}
