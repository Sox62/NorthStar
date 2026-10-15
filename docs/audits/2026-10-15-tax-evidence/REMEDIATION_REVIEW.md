# Independent review of REMEDIATION.md

## Follow-up after `01177f4` and the updated remediation document

Rechecked on 15 October 2026 at `72ece21`. The suite now passes **419/419** tests. Rerunning the same temporary probes confirms:

- F02's instrument-key alias example now reports cost AUD100 in both schedules, zero closing quantity and no cost-base variance.
- F03's foreign dividend example now reports gross AUD165, as expected; the earlier commission and duplicate-source checks still pass.
- F04's tax-position CSV now carries a missing-FX warning, and the dividend-only EOFY report now includes a parity/provisional note.

Those calculation/export counterexamples no longer reproduce. **The workbench portion of F04 remains open:** `app/tax/page.tsx` still does not consume or display `missingFx`, so the API's warning does not reach that screen.

The new gross-versus-discount explanation clarifies the large reconciliation gap, but its displayed bridge adds to **−5,973.90**, not −5,973.92. The listed holding components add to **−5,669.01**, not the bridge's −5,668.92. These are small residual presentation/rounding discrepancies requiring an explicit bridge. Section 6 also repeats the “mutating request used as a build probe” heading.

No application code, portfolio data or original remediation document was changed in this follow-up. Production/source-statement figures remain independently unverified. The original review below is retained as a record of the earlier build, with its conclusions superseded to the extent described above.

---

**Date:** 15 October 2026, Australia/Sydney

**Reviewed:** [REMEDIATION.md](REMEDIATION.md), commits `7534cba`, `39f56c4`, `b5e4e02`, and current working tree at `680865a`

**Scope:** read-only code/document review and isolated synthetic probes. No application code, portfolio records, live settings, deployments or original remediation document changed.

The remediation improves the tested cases, but **F02, F03 and F04 should remain partially resolved**. The reconciliation narrative also needs an arithmetic bridge. The full current `npm test` command passes **415/415** tests; the counterexamples below are additional cases outside those assertions.

## 1. High — F02 still uses a different holding identity in historical schedules

The document says historical schedules pool as the parcel engine does. The historical [historyKey](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/historical-cost.ts:41) actually keys by owner/broker/**instrumentKey**, whereas the parcel engine's [brokerKey](/Users/sox/Desktop/SouthernStar/lib/tax-lots.ts:198) keys by owner/broker/**symbol and exchange**. Reusing reconciled rows does not make these identities equivalent.

Reproduction: same owner, broker, account, ticker and exchange; buy one unit for AUD100 on 1 July 2025 with instrument key `Directshares:AUDIT:ASX`, then sell it for AUD300 on 2 July with instrument key `AUDIT:ASX`.

| Value | Expected / canonical engine | Historical schedule |
|---|---:|---:|
| Disposal cost | 100 | 300 |
| Closing quantity | 0 | 1 |

The report returns a **$200 cost-base reconciliation variance**. This is the same class of legacy/importer identity mismatch the existing canonical pool was designed to handle. Use canonical parcel movements/identity for the historical projection, rather than independently matching against a different key. The earlier LIFO and duplicate-source examples now work, but this counterexample prevents closing F02.

## 2. High — F03's foreign dividend gross conversion remains unfixed

The original F03 included both fee currency and dividend gross currency. The remediation covers fees only. [dividendGrossAud](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/income.ts:5) still treats generic raw `grossDividend` as AUD; the dividend CSV parser stores it in the original currency. The storage income summary has the same convention mismatch.

Rerunning the original importer-to-report probe gives:

| Supplied source facts | Expected AUD | Actual report AUD |
|---|---:|---:|
| Gross USD110, at 1.5 AUD/USD | 165 | **110** |
| Net USD100 | 150 | 150 |
| Withholding USD10 | 15 | 15 |

The CSV parser's row was explicitly given a valid FX rate to isolate this defect. Gross income is still inconsistent with net plus withholding. Keep F03 open for the income portion and test both EOFY and dashboard income summaries.

The IBKR USD commission probe **now passes**: cost AUD165 and gain AUD120, as expected. The duplicate-source schedule probe also now shows one disposal, two trade movements, AUD285 sale proceeds and AUD165 purchases. These successes do not cover the remaining income/identity cases.

## 3. High — F04's provisional warnings do not cover all affected surfaces or income

The remediation retains parity arithmetic and relies on warnings. Those warnings are currently incomplete:

- A USD100 buy and USD200 short-term sale without FX return taxable gain AUD100. `buildTaxLots.missingFx` contains two rows and the EOFY notes warn about parity. However, [tax-position CSV generation](/Users/sox/Desktop/SouthernStar/app/api/reports/tax-position/route.ts:123) discards that metadata: a direct GET against a disposable fixture store returns HTTP 200 and the figures, with **no missing-FX/provisional warning**. The tax workbench also does not render `missingFx`.
- A foreign dividend without FX is not included in that warning list, which is assembled from the engine's BUY/SELL/CORPORATE_ACTION stream. A dividend-only EOFY fixture reports net income AUD100 and gross AUD110 without an FX/provisional note.

Therefore F04 is partial even under the remediation's chosen fallback policy. Propagate incompleteness to every affected display/export and include income and fee-currency evidence. A total that retains assumed values must carry that status wherever it is consumed.

## 4. Medium — The section 7 reconciliation bridge does not add up

The document states SouthernStar 189,623.38 versus Sharesight 195,597.30, a difference of **−5,973.92**. Its explanatory amounts total:

```text
−6,407.12 + 576.36 + 161.75 = −5,669.01
```

That leaves **−304.91** unbridged. Removing the stated second-account contribution from the net difference gives **433.20**, rather than the stated 738 raw residual. These may involve different gross/discounted or account-exclusion bases, but the document must show that conversion explicitly before asserting the differences are all accounted for. This review verifies arithmetic only; the claimed production balances and accountant/source statements were not independently accessed.

## Other conclusions and audit correction

- The 415-test claim is independently confirmed. Read-side pension coercion and API refusal are present; the SMSF's user-confirmed **100% pension phase** remains the intended current treatment.
- The original register's assertion that the old UI was already SMSF-only was incorrect. The `7534cba` diff shows it previously offered the control for any non-overall scope, including Personal; it now limits it to SMSF. The API/persistence defect identified in F01 remains valid, and the remediation addresses that path.
- Leaving F05 pending accountant confirmation follows the earlier brief. F08/F09 and F12 are correctly acknowledged as partial/open; this review does not approve schema, retention, correction or frozen-report policy decisions.
- The original local-only benchmark must retain its qualification. The remediation's production comparison also needs its own evidence and a reconciled bridge. Agreement with Sharesight alone is not a substitute for source-level accuracy.

## Evidence and reproduction

Commands run from `/Users/sox/Desktop/SouthernStar`:

```sh
npm test
node --import tsx /private/tmp/southernstar-tax-audit-20261015/import-probes.cts
node --import tsx /private/tmp/southernstar-remediation-review-20261015/review.cts
```

The original import harness is preserved in [REPRODUCTION.md](REPRODUCTION.md). The additional review harness sets `NORTH_STAR_DATA_FILE` to a new disposable file and removes `DATABASE_URL` from its own process before loading storage. Its sanitized outputs are retained in `/private/tmp/southernstar-remediation-review-20261015/results.json`; test output is `/private/tmp/southernstar-remediation-review-20261015-tests.log`.

The review harness uses the exact three fixtures described above: instrument-key aliases, a missing-FX buy/sell pair followed through the CSV GET, and a missing-FX dividend-only EOFY report. No production POST or live database call was used.
