import { useState } from "react";
import type { Page } from "../model/types";
import { PASSWORD_RULES, strongPassword, suggestPassword } from "../export/protect";

export function PasswordFields({ page, mutatePage }: { page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }) {
  const [show, setShow] = useState(false);
  const password = page.protect?.password ?? "";
  const strong = strongPassword(password);
  return (
    <>
      <div className="field">
        <span className="field-label">Password</span>
        <div className="field-row">
          <input type={show ? "text" : "password"} value={password} autoComplete="new-password" onChange={(e) => mutatePage((p) => void (p.protect!.password = e.target.value), "protect.password")} />
          <button className="btn btn--small" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"}
          </button>
          <button
            className="btn btn--small"
            onClick={() => {
              setShow(true);
              mutatePage((p) => void (p.protect!.password = suggestPassword()), "protect.password");
            }}
          >
            Suggest one
          </button>
        </div>
        <ul className="password-rules">
          {PASSWORD_RULES.map((r) => (
            <li key={r.label} className={r.ok(password) || password.trim().length >= 16 ? "is-ok" : undefined}>
              {r.ok(password) || password.trim().length >= 16 ? "✓" : "○"} {r.label}
            </li>
          ))}
        </ul>
        {!strong && <span className="dialog-status dialog-status--error">The site can't be published until this page has a strong password (or a phrase of 16+ characters).</span>}
      </div>
      <div className="field">
        <span className="field-label">Hint on the lock screen (optional)</span>
        <input
          type="text"
          placeholder="The password is in your welcome email."
          value={page.protect?.hint ?? ""}
          onChange={(e) => mutatePage((p) => void (p.protect!.hint = e.target.value), "protect.hint")}
        />
      </div>
      <p className="field-hint">
        The page's content is encrypted in the published file and opened in the visitor's browser: no server needed. Its title and description stay visible, pictures can still be reached at their own
        addresses, and the page is kept out of search engines. Anyone with your project file can see the password.
      </p>
    </>
  );
}

export function ProtectSetting({ page, mutatePage }: { page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }) {
  const on = Boolean(page.protect);
  return (
    <section className="inspector-group">
      <h3 className="panel-heading">Password</h3>
      <label className="field field--toggle">
        <span className="field-label">Only people with the password can see this page</span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            mutatePage((p) => {
              if (e.target.checked) p.protect = { password: "", hint: "" };
              else delete p.protect;
            }, "protect")
          }
        />
      </label>
      {on && <PasswordFields page={page} mutatePage={mutatePage} />}
    </section>
  );
}
