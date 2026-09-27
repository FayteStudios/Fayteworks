import type { BlockDefinition } from "./types";
import { list, num, str } from "./util";

export function money(amount: number, currency: string): string {
  const n = Math.round(amount * 100) / 100;
  return `${currency}${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function totals(items: { qty: number; price: number }[], taxRate: number): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export const businessDefinitions: BlockDefinition[] = [
  {
    type: "lineitems",
    label: "Line items",
    category: "Content",
    icon: "🧾",
    description: "A table of items with quantities and prices that adds up the total (invoices, quotes, price lists).",
    defaultSize: { w: 12, h: 14 },
    defaultProps: {
      items: [
        { description: "Website design and build", qty: 1, price: 1800 },
        { description: "Extra page", qty: 2, price: 150 }
      ],
      currency: "$",
      taxRate: 0,
      taxLabel: "Tax",
      showQty: true
    },
    fields: [
      {
        key: "items",
        label: "Items",
        kind: "list",
        itemLabel: "item",
        itemTitleKey: "description",
        newItem: { description: "New item", qty: 1, price: 0 },
        itemFields: [
          { key: "description", label: "Description", kind: "text" },
          { key: "qty", label: "Quantity", kind: "number", min: 0 },
          { key: "price", label: "Price each", kind: "number", min: 0 }
        ]
      },
      { key: "currency", label: "Currency sign", kind: "text", placeholder: "$" },
      { key: "taxRate", label: "Tax (%)", kind: "number", min: 0, max: 100, hint: "0 to leave it out." },
      { key: "taxLabel", label: "Tax name", kind: "text", placeholder: "VAT, GST, Sales tax…" },
      { key: "showQty", label: "Show quantities", kind: "toggle" }
    ],
    mobileHeight: "content",
    grows: true,
    render: (p) => {
      const items = list(p.items).map((i) => ({ description: str(i.description as string), qty: Number(i.qty) || 0, price: Number(i.price) || 0 }));
      const currency = str(p.currency, "$");
      const rate = Math.max(0, num(p.taxRate, 0));
      const t = totals(items, rate);
      const showQty = p.showQty !== false;
      return (
        <table className="b-lineitems">
          <thead>
            <tr>
              <th scope="col">Description</th>
              {showQty && <th scope="col">Qty</th>}
              {showQty && <th scope="col">Price</th>}
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={n}>
                <td>{i.description}</td>
                {showQty && <td>{i.qty}</td>}
                {showQty && <td>{money(i.price, currency)}</td>}
                <td>{money(i.qty * i.price, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {rate > 0 && (
              <>
                <tr>
                  <th scope="row" colSpan={showQty ? 3 : 1}>
                    Subtotal
                  </th>
                  <td>{money(t.subtotal, currency)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={showQty ? 3 : 1}>
                    {str(p.taxLabel, "Tax")} ({rate}%)
                  </th>
                  <td>{money(t.tax, currency)}</td>
                </tr>
              </>
            )}
            <tr className="b-lineitems-total">
              <th scope="row" colSpan={showQty ? 3 : 1}>
                Total
              </th>
              <td>{money(t.total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      );
    }
  }
];
