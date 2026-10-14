"use client";

import { useState } from "react";
import {
  holdingSelectionKey,
  parcelSelectionLabels,
  parcelSelectionMethods,
  type ParcelSelection,
  type ParcelSelectionMethod,
} from "@/lib/parcel-selection";

type Holding = { symbol: string; exchange: string };

/**
 * Which parcels a disposal consumes, for the book on screen.
 *
 * It sits beside the pension-phase switch rather than in a settings page for the same reason: it
 * changes every realised figure below it. The default covers the book, and a holding is listed only
 * once it has an election of its own — there is no value in thirty-seven rows all saying "first in,
 * first out", and the exceptions are the thing worth seeing.
 */
export function ParcelSelectionControl({
  selection,
  holdings,
  busy,
  onChange,
}: {
  selection: ParcelSelection;
  /** Holdings with realised or open lots in view, for the add control. */
  holdings: Holding[];
  busy: boolean;
  onChange: (selection: ParcelSelection) => void;
}) {
  const [adding, setAdding] = useState("");
  const overrides = Object.entries(selection.overrides ?? {}).sort(([a], [b]) => a.localeCompare(b));

  const write = (next: Record<string, ParcelSelectionMethod>) => {
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, method]) => method));
    onChange({ method: selection.method, ...(Object.keys(cleaned).length ? { overrides: cleaned } : {}) });
  };

  const choices = [...new Map(holdings.map((holding) => [holdingSelectionKey(holding), holding])).keys()]
    .filter((key) => !(key in (selection.overrides ?? {})))
    .sort();

  return (
    <div className="parcelSelection">
      <label className="parcelSelectionDefault">
        <span>Parcel matching<em>Applies to every holding without its own</em></span>
        <select
          value={selection.method}
          disabled={busy}
          onChange={(event) => onChange({ ...selection, method: event.target.value as ParcelSelectionMethod })}
        >
          {parcelSelectionMethods.map((method) => (
            <option key={method} value={method}>{parcelSelectionLabels[method]}</option>
          ))}
        </select>
      </label>

      {overrides.length ? (
        <ul className="parcelSelectionOverrides">
          {overrides.map(([holding, method]) => (
            <li key={holding}>
              <strong>{holding}</strong>
              <select
                value={method}
                disabled={busy}
                onChange={(event) => write({
                  ...(selection.overrides ?? {}),
                  [holding]: event.target.value as ParcelSelectionMethod,
                })}
              >
                {parcelSelectionMethods.map((option) => (
                  <option key={option} value={option}>{parcelSelectionLabels[option]}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove the ${holding} election`}
                onClick={() => {
                  const next = { ...(selection.overrides ?? {}) };
                  delete next[holding];
                  write(next);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {choices.length ? (
        <div className="parcelSelectionAdd">
          <select value={adding} disabled={busy} onChange={(event) => setAdding(event.target.value)} aria-label="Holding to give its own election">
            <option value="">Add a holding…</option>
            {choices.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <button
            type="button"
            disabled={busy || !adding}
            onClick={() => {
              // Seeded with the book default, so adding a row changes nothing until a method is
              // picked for it. An election should take effect when it is made, not when it is begun.
              write({ ...(selection.overrides ?? {}), [adding]: selection.method });
              setAdding("");
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
