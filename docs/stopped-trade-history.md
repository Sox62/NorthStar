# Stopped-out trade history

Open **Stops & Orders → Stopped-out trades**. The Personal, SMSF and Overall scope controls apply to the history. Records remain accessible after a position is sold, with an optional CSV download.

An imported IBKR sale appears automatically only when its executed quantity and fill price are valid, its reported order type is a stop/stop-limit/protect/trailing stop type, and its open/close indicator explicitly marks a closing trade. Cancelled/busted/correction-reference rows are excluded. A breached price, a vanished holding, or a missing open order never proves a stop execution. Each execution/partial exit has its own reference. Re-importing the same account and execution does not create another entry.

IBKR documents the **OrderType**, **OrderID**, execution identifiers and quantity/price fields in its [Trade Confirmation Configuration reference](https://www.ibkrguides.com/reportingreference/reportguide/trade%20confirmation%20configuration.htm). Flex queries are configurable. If a retained sale lacks the stop type or closing indicator, use **Record a stopped-out trade → An imported sale** to confirm it yourself. Do not assume the currently saved stop was the level in force when an old trade executed; enter the historical stop if known.

Use **Manual exit record** when an exit is not yet imported. It is labelled user-reported and does not create a broker execution, cash movement, tax disposal, or position change. If its broker sale arrives later, remove the manual classification and classify the imported sale to avoid keeping two journal rows for the same fill. The removed entry remains available for review.

The journal retains owner/account identity, trade and order references, date, quantity, actual fill, stop level when known, fees in their reported currency and notes. Fill-vs-stop is `(fill / stop - 1) × 100` for the recorded sale. Missing prices/fees remain unknown. It is not a realised profit/loss or tax calculation. The existing transaction/tax engine remains authoritative for those results.

Manual confirmations and remove/restore decisions append snapshots to `stop_exit_revisions`; they never delete the original transaction or rewrite prior reviews. PostgreSQL uses an insertion sequence to order revisions even when timestamps tie. Local-file stores retain the same revisions in their private data file. Imported fills remain linked by owner, broker, account and external execution reference.
