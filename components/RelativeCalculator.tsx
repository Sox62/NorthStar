"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { calculateRelativeRelationship, type RelativeCalculatorInput } from "@/northstar/lib/relative-calculator";

const initialInput: RelativeCalculatorInput = {
  leftLabel: "Asset",
  rightLabel: "Gold",
  leftStartPrice: 100,
  leftEndPrice: 120,
  leftStartFxToAud: 1,
  leftEndFxToAud: 1,
  rightStartPrice: 4000,
  rightEndPrice: 4400,
  rightStartFxToAud: 1,
  rightEndFxToAud: 1,
};

const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
const number = (value: number) => value.toLocaleString("en-AU", { maximumFractionDigits: 4 });
const aud = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(value);

type NumericKey = Exclude<keyof RelativeCalculatorInput, "leftLabel" | "rightLabel">;

type FieldSpec = { key: NumericKey; label: string; step?: string };

const leftFields: FieldSpec[] = [
  { key: "leftStartPrice", label: "Start price" },
  { key: "leftEndPrice", label: "End price" },
  { key: "leftStartFxToAud", label: "Start FX to AUD", step: "0.0001" },
  { key: "leftEndFxToAud", label: "End FX to AUD", step: "0.0001" },
];

const rightFields: FieldSpec[] = [
  { key: "rightStartPrice", label: "Start price" },
  { key: "rightEndPrice", label: "End price" },
  { key: "rightStartFxToAud", label: "Start FX to AUD", step: "0.0001" },
  { key: "rightEndFxToAud", label: "End FX to AUD", step: "0.0001" },
];

export default function RelativeCalculator() {
  const [input, setInput] = useState<RelativeCalculatorInput>(initialInput);
  const result = useMemo(() => {
    try {
      return { value: calculateRelativeRelationship(input), error: "" };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid calculator input." };
    }
  }, [input]);

  const setText = (key: "leftLabel" | "rightLabel", value: string) => setInput((current) => ({ ...current, [key]: value }));
  const setNumber = (key: NumericKey, value: string) => setInput((current) => ({ ...current, [key]: Number(value) }));

  return (
    <main className="shell">
      <PageHeader
        title="Relative calculator"
        description="Manual relationship calculator for asset versus reserve, commodity, ETF or leader comparisons. Values are converted to AUD before the ratio is measured."
        links={[
          { href: "/", label: "State of play" },
          { href: "/relative", label: "Relative leadership" },
          { href: "/prices", label: "Pricing" },
        ]}
      />

      <Card className="relativeCalcCard">
        <div className="panelHeader relativeHeader">
          <div>
            <p className="eyebrow">Manual calculator</p>
            <h2 className="cardTitle">Relationship check</h2>
            <p className="cardIntro">Use FX of 1 for AUD instruments. For USD/CAD/GBP, enter the AUD conversion rate at the start and end dates.</p>
          </div>
        </div>

        <div className="relativeCalcGrid">
          <AssetInputPanel title="First asset" labelKey="leftLabel" labelValue={input.leftLabel} fields={leftFields} input={input} onText={setText} onNumber={setNumber} />
          <AssetInputPanel title="Benchmark / comparison" labelKey="rightLabel" labelValue={input.rightLabel} fields={rightFields} input={input} onText={setText} onNumber={setNumber} />
        </div>

        {result.error ? <Notice tone="error" title="Calculator input issue">{result.error}</Notice> : null}

        {result.value ? (
          <>
            <SummaryGrid
              entries={[
                [`${result.value.leftLabel} AUD`, percent(result.value.leftAudReturnPercent), result.value.leftAudReturnPercent >= 0 ? "positive" : "negative"],
                [`${result.value.rightLabel} AUD`, percent(result.value.rightAudReturnPercent), result.value.rightAudReturnPercent >= 0 ? "positive" : "negative"],
                ["Ratio move", percent(result.value.ratioReturnPercent), result.value.ratioReturnPercent >= 0 ? "positive" : "negative"],
                ["Winner", result.value.winner === "flat" ? "Flat" : result.value.winner === "left" ? result.value.leftLabel : result.value.rightLabel],
              ]}
            />
            <div className="relativeCalcResult">
              <strong>{result.value.interpretation}</strong>
              <dl>
                <div><dt>{result.value.leftLabel} start/end AUD</dt><dd>{aud(result.value.leftStartAud)} <span aria-hidden="true">to</span> {aud(result.value.leftEndAud)}</dd></div>
                <div><dt>{result.value.rightLabel} start/end AUD</dt><dd>{aud(result.value.rightStartAud)} <span aria-hidden="true">to</span> {aud(result.value.rightEndAud)}</dd></div>
                <div><dt>Ratio start/end</dt><dd>{number(result.value.ratioStart)} <span aria-hidden="true">to</span> {number(result.value.ratioEnd)}</dd></div>
                <div><dt>Local returns</dt><dd>{result.value.leftLabel} {percent(result.value.leftLocalReturnPercent)} · {result.value.rightLabel} {percent(result.value.rightLocalReturnPercent)}</dd></div>
              </dl>
            </div>
          </>
        ) : null}
      </Card>
    </main>
  );
}

function AssetInputPanel({ title, labelKey, labelValue, fields, input, onText, onNumber }: {
  title: string;
  labelKey: "leftLabel" | "rightLabel";
  labelValue: string;
  fields: FieldSpec[];
  input: RelativeCalculatorInput;
  onText: (key: "leftLabel" | "rightLabel", value: string) => void;
  onNumber: (key: NumericKey, value: string) => void;
}) {
  return (
    <section className="relativeCalcPanel">
      <h3>{title}</h3>
      <label>
        <span>Label</span>
        <input value={labelValue} onChange={(event) => onText(labelKey, event.target.value)} />
      </label>
      <div className="relativeCalcFields">
        {fields.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <input type="number" min="0" step={field.step ?? "0.01"} value={input[field.key]} onChange={(event) => onNumber(field.key, event.target.value)} />
          </label>
        ))}
      </div>
    </section>
  );
}
