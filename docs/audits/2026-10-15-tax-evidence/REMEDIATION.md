# Response to the 15 October tax integrity audit

**Date:** 15 October 2026
**Responding to:** [AUDIT_REPORT.md](AUDIT_REPORT.md) and [DISCREPANCY_REGISTER.md](DISCREPANCY_REGISTER.md)
**Audit basis:** `2b7184f` · **This work:** `7534cba`, `39f56c4`, `b5e4e02`
**Tests:** 399 → 415, all passing

The audit was taken seriously because it was right. Its findings were reproduced independently
before any of them were acted on, and one of them — F02 — is a defect in work delivered the
previous day that should have been caught at the time and was not.

This document records what was fixed, what was partly fixed, what was deliberately left, and the
reasoning in each case. Where the audit's conclusion was qualified, the qualification is stated
with the evidence behind it.

---

## 1. Verification before remediation

Every High finding was reproduced against the current build rather than accepted on the strength
of the register. All of them reproduced.

| Finding | How it was checked | Outcome |
|---|---|---|
| F01 personal pension exemption | API, UI and reader inspection | Confirmed — the switch was visible on the Personal tab, the API accepted it, and `/api/tax-lots` and the tax CSV honoured it |
| F02 schedules disagree | synthetic probe, then live data | Confirmed, and worse in production than in the probe |
| F03 fee currency | code reading plus a probe | Confirmed — the parcel engine added fees unconverted, the EOFY schedules always converted them |
| F04 missing FX treated as parity | probe | Confirmed — a USD100 buy and USD200 sale reported cost AUD100 and gain AUD100 with an ordinary FIFO note |
| F05 twelve-month boundary | probe at 364/365/366 days | Confirmed — `false / true / true`, so the anniversary received a discount it should not |
| F06 FX rows lost on read | SQL inspection | Confirmed — `JOIN instruments i ON i.id=t.instrument_id` is an inner join and FX rows carry a null instrument |
| F07 second account's cash | code inspection | Confirmed — the deactivation matched on institution alone |
| F11 calendar validity | probe | Confirmed — `from=2026-02-30` was accepted |
| "two test files outside the command" | file comparison | Confirmed — `lib/risk/stops.test.ts` and `lib/storage/postgres-helpers.test.ts` had never run |

### What F02 looked like in production

The probe understated it. In the live FY2026 pack, BOE appeared as **three** historical-cost rows,
split by account key:

```
closing 31,600 units   balance $47,611.69   cost of sales $0
closing 25,237 units   balance $90,870.73   cost of sales $2,565.32
closing      0 units                        cost of sales $10,030.95
```

56,837 units at year end, in a holding the parcel engine correctly closed at zero, costed before
its 1-for-8 consolidation. Every defect fixed in the engine on 14 October was still live in that
schedule, because the schedule re-read the raw rows. The report's own reconciliation flagged it:

```
CGT realised proceeds subtotal    1,361,824.58 vs 1,097,772.54   variance 264,052.04   review
CGT realised cost base subtotal     932,767.34 vs   848,298.06   variance  84,469.27   review
Historical closing cost movement    754,283.11 vs   663,329.66   variance  90,953.45   review
```

---

## 2. Three qualifications to the audit

The audit is sound. Three of its statements need context that it could not have had.

**The $229,693.16 benchmark is not a live figure.** It came from the stale local JSON store — 123
Directshares trades, no IBKR rows, no dividends, and none of the imports from 14–15 October. The
audit says so, and says explicitly that it is not a validated Sharesight discrepancy. But the
number sits beside $195,597.00 under a heading of "Difference $34,096.16", and a reader will take
that as *the tool is $34k out*. It is not. Production reads **$189,623.38**, and excluding the
second Directshares account — which Sharesight's portfolio does not contain — the per-holding gap
is **$738 on $255,143 of gross gains, 0.29%**.

**F03 can be settled, where the audit leaves it open.** The register correctly identifies that the
parcel engine and the EOFY schedules treat the fee field differently and that no normalised field
resolves which is right. There is evidence: the FY2025-26 reconciliation ties CDE, SVM and SIL to
the cent against the accountant's own parcel detail, and those are USD and CAD Directshares trades
whose brokerage is already AUD. They can only tie if the parcel engine's unconverted treatment is
correct for that importer. So the engine was right for Directshares and the schedules
over-converted; for IBKR the reverse holds, exactly as P14 shows. That narrowed the fix from a
judgement call to a per-importer field.

**F10 was already labelled on two surfaces, but not in the pack.** The "an open position cannot be
rewound" limitation is stated on `/tax` and in the tax-position CSV. The EOFY pack said nothing,
so the finding stands there — and in the end the pack was fixed rather than labelled.

---

## 3. Fixed

### F01 — pension phase fenced to the fund · `7534cba`

Exempt current pension income belongs to a complying fund paying a retirement phase income stream.
An individual does not have it, at any age. A Personal book carrying the flag is not a
configuration choice but a mistake that reports every personal capital gain as untaxed.

- The API **refuses** the request rather than coercing it quietly, because a caller asking for this
  has made an error worth naming.
- The switch is offered on the SMSF tab alone.
- Both adapters coerce on **read** as well as write, so a value already stored against a Personal
  book cannot take effect while it is being cleaned up. No migration is required for the number to
  stop being wrong.

### F02 — one reconciled set feeds every schedule · `7534cba`

`buildTaxLots` now exposes the trades it actually counted, and the trade and historical-cost
schedules read that instead of the raw rows. The historical schedule additionally pools by broker
as the engine does, applies the parcel election, and rescales for a corporate action **through the
engine's own function** rather than a second copy of the rule. The audit was explicit about not
growing a second engine and that was the right instruction.

Live effect:

| | Before | After |
|---|---|---|
| BOE historical rows | 3, closing 56,837 units | 1, closing 0 units |
| Historical-cost rows | 60 | 45 |
| Trade movements | 99 | 90 |
| CGT realised proceeds variance | 264,052.04 | 2,686.70 |
| CGT realised cost base variance | 84,469.27 | passes |
| Historical closing cost variance | 90,953.45 | 9.14 |

Net capital gain unchanged at **189,623.38** — the CGT engine was already right; what moved is
everything that had been contradicting it.

### F03 — fee currency · `39f56c4`

Importers now state the currency fees are denominated in. Rows stored before the field existed fall
back to what their importer is known to have done, which is the only reading of them that is ever
right. One shared rule in `lib/money.ts` serves the parcel engine, the historical schedule and the
trade schedule.

Live effect: EWZ brokerage on a USD trade reads **$129.09** where it read $196.28.

### F04 — missing exchange rates · `39f56c4`

A foreign row with no rate was valued at 1, producing an AUD figure that reads as a measurement and
is not one. Those rows are collected and named in the data-quality notes, and the totals that
include them are called provisional.

The arithmetic still produces a number. Refusing to value the row would make a total silently
smaller, which is a worse failure than a stated assumption. FY2026 has no exposure — all 36 of its
foreign trades carry rates. FY2027 has 15 IBKR rows that do not.

### F06 — FX rows unreadable · `39f56c4`

A currency conversion has no security, so it is stored with a null instrument, and the only read
the application has inner-joined instruments. Every FX row was invisible while sitting in the
table. Left-joined, with the pair the broker named recovered from the retained row.

### F07 — second account's cash · `39f56c4`

Scoped to the importing account, keyed on the account segment of the cash-account name — the only
account identity a cash row carries, since the table has no account column.

### F10 — year end reconstructed from the trades · `39f56c4`

The unrealised schedule took its quantities from current holdings, so a position sold in August
reported the year-end value of two units spread across the one still held, and a holding sold out
entirely vanished from a schedule whose purpose is to show what was owned on 30 June. It is now
rebuilt from the trades at the cut-off, reusing the historical schedule's accumulation rather than
duplicating it.

Live effect: **21 open lots** in the FY2026 pack where there had been none.

### F11 — calendar validity · `39f56c4`

`2026-02-30` matched the pattern and sorted correctly, so a range could open on a day that never
happened. Endpoints are round-tripped through UTC and rejected with 400 if the parser rolls them.

### Not in the register — nil-gain lots vanish

Fixing F10 surfaced a defect the audit did not list. `unrealisedCgtReport` bucketed on `> 0` and
`< 0`, so a lot sitting at precisely nil — a holding valued at its own cost because no year-end
price exists — belonged to none of the three buckets and disappeared from the schedule. The
realised side had the same gap and the same fix. Every lot now lands in exactly one bucket.

---

## 4. Partly fixed

### F08 — evidence retention · `b5e4e02`

**Done:** the local importer no longer discards IBKR's original row. It was stripped locally while
the PostgreSQL path retained it, so the two stores disagreed about what evidence a transaction
carries. The row is the only record of what the source actually said.

**Not done:** import-batch references, original-file hashes and an immutable document store. See
section 5.

### F09 — source amendments · `b5e4e02`

**Done:** both adapters compare an arriving row against the stored one and report what moved.
`ON CONFLICT DO NOTHING` cannot tell a repeat from an amendment, so the PostgreSQL path reads the
stored row back when an insert does nothing. Conflicts are surfaced in the import response.

**Reported, never applied.** Which version is right is a question about the broker's correction,
not one an importer should answer by overwriting a stored figure.

**A deliberate trade-off:** a field the incoming row does not state is not treated as a change.
Importers leave fields unset wherever a source is silent, so judging those would raise a conflict
on every ordinary re-import. The cost is that an amendment which genuinely *clears* a value goes
unflagged. That is the quieter of the two errors.

**Not done:** persisting versions, correction lineage, or mapping IBKR's cancellation and reversal
identifiers. The last of those needs real samples before a policy can be chosen.

---

## 5. Not fixed, and why

### F05 — the twelve-month boundary

`isDiscountEligible` uses `heldDays >= 365`, so a parcel sold on its anniversary receives the
discount. The audit's conclusion matches the earlier tax-engine brief: 20 June 2025 to 20 June 2026
should not qualify, and `>= 366` produces that.

It was left because **the brief asks for the accountant's confirmation before the rule changes**,
and no parcel currently sits on the boundary, so it is worth nothing today and will eventually be
worth a great deal. Changing a rule of this kind on a reading of guidance, in a tool whose output
is being used for real decisions, is not a call to make unilaterally. It belongs in the same
conversation as the second-account disposals.

### F08's second half and F12 — evidence lineage and frozen reports

These are not defects that can be patched. They are schema and policy work, and they need decisions
that are not an engineer's to make:

- Where do original documents live, for how long, and who may read them?
- When an election changes, do past reports keep the one in force at the time, or is a lodged year
  frozen whole?
- Does a correction supersede a row, or sit beside it as a version with both retained?
- What belongs in an export manifest — input hashes, settings, source coverage, generation bounds?

The audit stages them behind approval for the same reason. Building half a ledger without those
answers would produce something that looks like evidence and is not, which is worse than the
acknowledged gap. They remain open and scoped.

---

## 6. Errors made during this work

Two, both self-inflicted, both corrected.

**A mutating request used as a build probe.** `POST /api/tax-profiles` with
`{ownerType: PERSONAL, pensionPhase: true}` was used to test whether a deployment had landed. On
the old build it succeeded, three times, and Personal sat in pension phase for about a minute
before being reverted. No reported figure moved — the EOFY route forces the flag false for personal
regardless — but `/tax` and the tax CSV would have shown zero taxable gains for that minute. The
read-side coercion added for F01 is what made the revert a single call rather than a cleanup. A
liveness probe must be a read.

**Working-tree changes staged that were not mine.** `git add -A lib app` swept ten pre-existing
uncommitted files into a commit. It was caught before pushing, reset, and the files unstaged —
including separating a fee change from an unrelated `recordedSectorForInstrument` change inside
`lib/reports/eofy/trades.ts`, which both touched. All ten are intact and unstaged. Staging should
be explicit in a repository with someone else's work in progress.

---

## 7. State of the reconciliation

FY2025-26 personal, against the lodged Sharesight figure of $195,597.30:

| | |
|---|---:|
| SouthernStar | **189,623.38** |
| Difference | −5,973.92 |
| Holdings agreeing exactly | 28 of 37 |
| Like-for-like gap, excluding the second account | **$738 raw on $255,143 — 0.29%** |

The nine holdings that differ are all accounted for: **−6,407.12** is Directshares account
`4386162`, which Sharesight's portfolio does not contain; **576.36** is a confirmed AMIT cost base
increase on GDX, named on the fund's own distribution statement and not yet carried by the engine;
**161.75** is four small holdings not yet examined.

Two items remain for the accountant rather than for engineering: the five FY2025-26 disposals in
`4386162` — **$31,559.49 of proceeds and a net capital loss of $960.39**, absent from the lodged
return — and the twelve-month boundary rule in F05.

*Nothing here is tax advice. The $195,597 stands as lodged; this work is about making the tool
agree with it, and saying plainly where it does not.*
