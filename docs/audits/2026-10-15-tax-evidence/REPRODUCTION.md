# Reproduction harnesses (audit documentation)

These are recorded audit scripts, not application changes or a proposed second tax engine. Copy each fenced block to the stated temporary file and run from `/Users/sox/Desktop/SouthernStar` with `node --import tsx /private/tmp/southernstar-tax-audit-20261015/<filename>`. Create that temporary directory first. Existing Node dependencies are required. Each script must run in its own process.

`probes.cts` and `additional-probes.cts` mutate only the synthetic `/private/tmp/southernstar-tax-audit-20261015/fixture-store.json`; they do not use production storage. The main harness's preliminary P10 uses an empty dashboard and no price book for realised-gain stress testing. Use `local-report.cts` for the authoritative observation about this available local snapshot, including its actual dashboard/price-book coverage. No source-level accuracy claim follows from either run.

`local-report.cts` explicitly points at the ignored legacy store and invokes read methods only; it checks its source hash before/after. It writes sanitized summary results to the temporary directory. Source records, bank account numbers, credentials and original raw rows are not emitted.

## probes.cts

```typescript
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = '/Users/sox/Desktop/SouthernStar';
const temp = '/private/tmp/southernstar-tax-audit-20261015';
process.env.NORTH_STAR_DATA_FILE = path.join(temp,'fixture-store.json');
const {buildTaxLots} = require(path.join(root,'lib/tax-lots.ts'));
const {buildEofyReport} = require(path.join(root,'lib/reports/eofy.ts'));
const {parseIbkrFlexXml} = require(path.join(root,'lib/integrations/ibkr.ts'));
const {incomeRows} = require(path.join(root,'lib/reports/eofy/income.ts'));
const {reportPeriod} = require(path.join(root,'lib/reports/report-period.ts'));
const {LocalStorageAdapter} = require(path.join(root,'lib/storage/local.ts'));
const empty = {version:7,transactions:[],positions:[],openOrders:[],riskPlans:[],riskSnapshots:[],cashAccounts:[],manualAssets:[],platinumPrices:[],dailyPrices:[],fxRates:[],snapshots:[],syncRuns:[],allocationTargets:[],sectorOverrides:[],minerFundamentals:[],fundamentalResearchDrafts:[],structuralLevels:[],compositeIndexResults:[],imports:[],taxProfiles:[]};
const dash = {scope:'personal',holdings:[],lastUpdated:'2026-06-30'};
const at = new Date('2026-10-15T01:00:00Z');
const tx = (id,type,date,cost,extra={}) => ({id,externalId:id,ownerType:'PERSONAL',broker:'Directshares',accountKey:'AUDIT-ACCOUNT',symbol:'AUDIT',exchange:'ASX',instrumentKey:'AUDIT:ASX',currency:'AUD',fxRateToBase:1,quantity:1,cost,tradeDate:date,type,source:'audit-fixture',fees:0,taxes:0,...extra});
const output = [];
function emit(id,data){output.push({id,...data});console.log(JSON.stringify(output.at(-1)));}
(async()=>{
const selected = buildEofyReport('personal',dash,[tx('a','BUY','2025-07-01',100),tx('b','BUY','2025-07-02',200),tx('c','SELL','2025-07-03',300)],2026,at,undefined,{pensionPhase:false},{method:'lifo'});
emit('P01-lifo-historical',{realisedCostAud:selected.realisedLots[0].costAud,expectedCostAud:200,historicalCostOfSalesAud:selected.historicalCost[0].costOfSalesAud,historicalMethod:selected.historicalCost[0].allocationMethod,reconciliation:selected.reconciliation.rows.filter(x=>x.section==='CGT'&&x.status==='review')});
const missing = buildTaxLots(dash,[tx('d','BUY','2025-07-01',100,{currency:'USD',fxRateToBase:undefined}),tx('e','SELL','2025-07-02',200,{currency:'USD',fxRateToBase:undefined})],at);
emit('P02-missing-fx',{costAud:missing.realisedLots[0].costAud,gainAud:missing.realisedLots[0].realisedGainAud,note:missing.realisedLots[0].note,expected:'AUD amount unknown, missing FX exception required'});
const ibkrTx=[tx('f','BUY','2025-07-01',100,{broker:'IBKR',currency:'USD',fxRateToBase:1.5,fees:10}),tx('g','SELL','2025-07-02',200,{broker:'IBKR',currency:'USD',fxRateToBase:1.5,fees:10,netCash:190})];
const fees=buildEofyReport('personal',dash,ibkrTx,2026,at);
emit('P03-foreign-fees',{expectedBuyCostAud:165,actualBuyCostAud:fees.realisedLots[0].costAud,historicalBuyCostAud:fees.historicalCost[0].costOfSalesAud,expectedGainAud:120,actualGainAud:fees.realisedLots[0].realisedGainAud});
const div=tx('h','DIVIDEND','2025-08-01',0,{currency:'USD',fxRateToBase:1.5,netCash:100,taxes:10,raw:{grossDividend:110}});
const payment=incomeRows([div],'2025-07-01','2026-06-30').payments[0];
emit('P04-foreign-income',{grossIncomeAud:payment.grossIncomeAud,netIncomeAud:payment.netIncomeAud,taxWithheldAud:payment.taxWithheldAud,expectedGrossIncomeAud:165});
for(const sale of ['2026-06-19','2026-06-20','2026-06-21']){
 const lot=buildTaxLots(dash,[tx('i','BUY','2025-06-20',100),tx('j','SELL',sale,200)],at).realisedLots[0];
 emit('P05-boundary-'+lot.heldDays,{acquired:'2025-06-20',sold:sale,heldDays:lot.heldDays,eligible:lot.discountEligible,taxableGainAud:lot.taxableGainAud});
}
const xml=(account,body)=>`<FlexQueryResponse type="AF"><FlexStatements count="1"><FlexStatement accountId="${account}" fromDate="20250701" toDate="20260630">${body}</FlexStatement></FlexStatements></FlexQueryResponse>`;
const cash=`<CashReport><CashReportCurrency currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" endingCash="100" toDate="20260630" /></CashReport>`;
const omitted=parseIbkrFlexXml(xml('SYNTH-1',cash+'<CashTransactions><CashTransaction type="Deposits/Withdrawals" amount="100" currency="USD" transactionID="deposit-1" reportDate="20260630"/><CashTransaction type="Dividends" amount="10" currency="USD" transactionID="div-1" reportDate="20260630"/></CashTransactions>'));
emit('P06-cash-section',{statementCashTransactions:2,parsedTransactions:omitted.transactions.length,aggregateCashAud:omitted.cash.balanceAud});
const invalid=reportPeriod(new URLSearchParams('from=2026-02-30&to=2026-06-30'),at);
emit('P07-invalid-date',{accepted:invalid});
fs.writeFileSync(process.env.NORTH_STAR_DATA_FILE,JSON.stringify(empty));
const adapter=new LocalStorageAdapter();
const report={accountId:'SYNTH-1',fromDate:'20250701',toDate:'20260630',transactions:[tx('k','BUY','2025-07-01',100,{raw:{transactionID:'k',originalEvidence:'fixture'}})],openPositions:[],openOrders:[],navSnapshots:[],cash:null,cashBalances:[]};
const first=await adapter.importIbkr(report,'PERSONAL');
const second=await adapter.importIbkr(report,'PERSONAL');
const correction=await adapter.importIbkr({...report,transactions:[{...report.transactions[0],cost:150}]},'PERSONAL');
let stored=JSON.parse(fs.readFileSync(process.env.NORTH_STAR_DATA_FILE,'utf8'));
emit('P08-local-idempotency-provenance',{firstImported:first.imported,reimportImported:second.imported,reimportDuplicates:second.duplicates,storedCount:stored.transactions.length,rawRetained:!!stored.transactions[0].raw,correctionDuplicates:correction.duplicates,storedOriginalCost:stored.transactions[0].cost,amendedCost:150});
fs.writeFileSync(process.env.NORTH_STAR_DATA_FILE,JSON.stringify(empty));
function cashReport(account,balance){const c={externalAccountId:account,currency:'AUD',balance,balanceAud:balance,settledBalance:balance,settledBalanceAud:balance,fxRateToAud:1,asOfDate:'2026-06-30'};return {...report,accountId:account,transactions:[],cash:c,cashBalances:[]};}
await adapter.importIbkr(cashReport('SYNTH-1',100),'PERSONAL');
await adapter.importIbkr(cashReport('SYNTH-2',200),'PERSONAL');
stored=JSON.parse(fs.readFileSync(process.env.NORTH_STAR_DATA_FILE,'utf8'));
emit('P09-two-accounts-cash',{expectedAggregateCashAud:300,activeCashAud:stored.cashAccounts.filter(x=>x.isActive).reduce((s,x)=>s+x.balanceAud,0),activeAccounts:stored.cashAccounts.filter(x=>x.isActive).length});
const legacyFile=path.join(root,'.north-star/data.json');const original=fs.readFileSync(legacyFile);const local=JSON.parse(original);const localTx=local.transactions.filter(x=>x.ownerType==='PERSONAL');
const fy=buildEofyReport('personal',dash,localTx,2026,at);
emit('P10-local-snapshot',{sha256:crypto.createHash('sha256').update(original).digest('hex'),transactions:localTx.length,fy2026RealisedLots:fy.realisedLots.length,unmatchedAcquisitionLots:fy.realisedLots.filter(x=>!x.acquisitionDate).length,netCapitalGainAud:fy.summary.taxableRealisedAud,sharesightTargetMentionedInOldBrief:195597,reconciliation:fy.reconciliation.status,reviewRows:fy.reconciliation.rows.filter(x=>x.status==='review').map(x=>({check:x.check,varianceAud:x.varianceAud})),comparisonStatus:'Not verified: original statements and elections unavailable; local snapshot is not established as deployed dataset'});
// Independently recompute one fully matched AUD disposal using only original persisted records.
const sample=fy.realisedLots.find(l=>l.acquisitionDate&&l.exchange==='ASX'&&l.quantity>0);
const related=localTx.filter(t=>t.symbol===sample.symbol&&t.exchange===sample.exchange).sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate)||a.externalId.localeCompare(b.externalId));
const q=[];let checked=false;
for(const t of related){const qty=Math.abs(t.quantity||0);if(t.type==='BUY'){q.push({qty,unit:(Math.abs(t.cost*t.fxRateToBase)+(t.fees||0)+(t.taxes||0))/qty,date:t.tradeDate,id:t.id});continue;}if(t.type!=='SELL')continue;let rest=qty;const proceeds=(t.netCash!=null?Math.abs(t.netCash*t.fxRateToBase):Math.abs(t.cost*t.fxRateToBase)-(t.fees||0)-(t.taxes||0))/qty;for(const buy of q){const take=Math.min(rest,buy.qty);if(take<=0)continue;const gain=(proceeds-buy.unit)*take;if(!checked&&t.tradeDate===sample.saleDate&&buy.date===sample.acquisitionDate&&Math.abs(take-sample.quantity)<1e-6){emit('P11-independent-AUD-sample',{sample:'AUD-001',buyRowHash:crypto.createHash('sha256').update(buy.id).digest('hex').slice(0,12),saleRowHash:crypto.createHash('sha256').update(t.id).digest('hex').slice(0,12),acquisitionDate:buy.date,saleDate:t.tradeDate,matchedQuantity:take,independentCostAud:buy.unit*take,reportedCostAud:sample.costAud,independentGainAud:gain,reportedGainAud:sample.realisedGainAud,originalStatementAvailable:false});checked=true;}buy.qty-=take;rest-=take;}}
fs.writeFileSync(path.join(temp,'probe-results.json'),JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
```

## additional-probes.cts

```typescript
const fs=require('node:fs');const path=require('node:path');const root='/Users/sox/Desktop/SouthernStar';const temp='/private/tmp/southernstar-tax-audit-20261015';process.env.NORTH_STAR_DATA_FILE=path.join(temp,'fixture-store.json');
const {buildTaxLots}=require(path.join(root,'lib/tax-lots.ts'));
const {buildEofyReport}=require(path.join(root,'lib/reports/eofy.ts'));
const {LocalStorageAdapter}=require(path.join(root,'lib/storage/local.ts'));
const at=new Date('2026-10-15T01:00:00Z');
const tx=(id,type,date,cost,extra={})=>({id,externalId:id,ownerType:'PERSONAL',broker:'Directshares',accountKey:'AUDIT',symbol:'AUDIT',exchange:'ASX',instrumentKey:'AUDIT:ASX',currency:'AUD',fxRateToBase:1,quantity:1,cost,tradeDate:date,type,source:'audit',fees:0,taxes:0,...extra});
const dashboard={scope:'personal',lastUpdated:'2026-10-15',holdings:[]};
(async()=>{
const a=new LocalStorageAdapter();await a.setTaxProfile('PERSONAL',true);const p=(await a.listTaxProfiles()).find(x=>x.ownerType==='PERSONAL');
const tax=buildTaxLots(dashboard,[tx('a','BUY','2025-07-01',100),tx('b','SELL','2025-08-01',200)],at,{pensionPhase:p.pensionPhase});
const output=[{id:'P12-personal-pension-profile',profileOwner:p.ownerType,pensionPhase:p.pensionPhase,gainAud:tax.realisedLots[0].realisedGainAud,taxableGainAud:tax.realisedLots[0].taxableGainAud,expectedTaxableGainAud:100}];
const holding={id:'h',ownerType:'PERSONAL',broker:'Directshares',accountKey:'AUDIT',instrumentKey:'AUDIT:ASX',symbol:'AUDIT',name:'Audit fixture',exchange:'ASX',currency:'AUD',assetClass:'Gold',quantity:1,lastPrice:400,averageCostAud:100,costAud:100,marketValueAud:400,dayGainAud:0,pnlAud:300,pnlPercent:300,valuationBasis:'market',asOfDate:'2026-10-15',source:'audit',weight:100};
const fy=buildEofyReport('personal',{...dashboard,holdings:[holding]},[tx('c','BUY','2025-07-01',100,{quantity:2}),tx('d','SELL','2026-08-01',200)],2026,at,{prices:[{id:'p',symbol:'AUDIT',exchange:'ASX',currency:'AUD',close:100,priceDate:'2026-06-30',source:'fixture',retrievedAt:'2026-07-01T00:00:00Z'}],fxRates:[]});
output.push({id:'P13-EOFY-open-quantity',historicalClosingQuantity:fy.historicalCost[0].closingQuantity,expectedEofyQuantity:2,openLotQuantity:fy.unrealisedCgt.shortTerm.concat(fy.unrealisedCgt.longTerm,fy.unrealisedCgt.losses).reduce((s,l)=>s+l.quantity,0),historicalMarketValueAud:fy.historicalCost[0].closingMarketValueAud,unrealisedMarketValueAud:fy.unrealisedCgt.shortTerm.concat(fy.unrealisedCgt.longTerm,fy.unrealisedCgt.losses).reduce((s,l)=>s+l.marketValueAud,0),note:fy.unrealisedCgt.shortTerm.concat(fy.unrealisedCgt.longTerm,fy.unrealisedCgt.losses)[0]?.note});
for(const row of output)console.log(JSON.stringify(row));fs.writeFileSync(path.join(temp,'additional-results.json'),JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
```

## import-probes.cts

```typescript
const fs=require('node:fs');const path=require('node:path');const r='/Users/sox/Desktop/SouthernStar';const t='/private/tmp/southernstar-tax-audit-20261015';
const {parseIbkrFlexXml}=require(path.join(r,'lib/integrations/ibkr.ts'));const {parseDividendCsv}=require(path.join(r,'lib/integrations/dividends.ts'));const {buildEofyReport}=require(path.join(r,'lib/reports/eofy.ts'));const {incomeRows}=require(path.join(r,'lib/reports/eofy/income.ts'));
const dash={scope:'personal',lastUpdated:'2026-06-30',holdings:[]};const at=new Date('2026-10-15T01:00:00Z');
const flex=parseIbkrFlexXml(`<FlexQueryResponse type="AF"><FlexStatements><FlexStatement accountId="SYNTH" fromDate="20250701" toDate="20260630"><Trades><Trade transactionID="b" tradeDate="20250701" symbol="AUDIT" conid="1" listingExchange="NYSE" buySell="BUY" quantity="1" cost="100" currency="USD" fxRateToBase="1.5" ibCommission="-10" ibCommissionCurrency="USD"/><Trade transactionID="s" tradeDate="20250702" symbol="AUDIT" conid="1" listingExchange="NYSE" buySell="SELL" quantity="1" cost="200" netCash="190" currency="USD" fxRateToBase="1.5" ibCommission="-10" ibCommissionCurrency="USD"/></Trades></FlexStatement></FlexStatements></FlexQueryResponse>`);
const tx=flex.transactions.map(x=>({...x,id:x.externalId,ownerType:'PERSONAL',broker:'IBKR',accountKey:'SYNTH'}));const report=buildEofyReport('personal',dash,tx,2026,at);
const csv='symbol,exchange,currency,payment date,gross dividend,net amount,withholding tax\nAUDIT,NYSE,USD,2025-08-01,110,100,10';let dividend;
try{const parsed=parseDividendCsv(csv);const fixed=parsed.map(x=>({...x,id:x.externalId,ownerType:'PERSONAL',broker:'Directshares',accountKey:'SYNTH',fxRateToBase:1.5}));const pay=incomeRows(fixed,'2025-07-01','2026-06-30').payments[0];dividend={csvRows:parsed.length,providedFxRate:1.5,netCash:fixed[0].netCash,rawGross:fixed[0].raw.grossDividend,actualGrossAud:pay.grossIncomeAud,expectedGrossAud:(fixed[0].netCash+fixed[0].taxes)*1.5};}catch(e){dividend={error:e.message};}
const duplicated=[...tx,...tx.map(x=>({...x,id:x.id+'-copy',externalId:x.externalId+'-copy',source:'IBKR Trade Confirmation Flex'}))];const dup=buildEofyReport('personal',dash,duplicated,2026,at);
const out=[{id:'P14-parser-to-commission',rows:tx.length,commissionCurrency:tx[0].raw.ibCommissionCurrency,costAud:report.realisedLots[0].costAud,expectedCostAud:165,gainAud:report.realisedLots[0].realisedGainAud,expectedGainAud:120},{id:'P15-dividend-parser-to-income',...dividend},{id:'P16-duplicate-schedules',inputRows:duplicated.length,canonicalRealisedLots:dup.realisedLots.length,tradeRows:dup.tradeMovements.length,reportedSellSummaryAud:dup.summary.sellsAud,canonicalSaleProceedsAud:dup.realisedLots.reduce((s,x)=>s+x.proceedsAud,0),historicalPurchasesAud:dup.historicalCost[0].purchasesAud}];for(const x of out)console.log(JSON.stringify(x));fs.writeFileSync(path.join(t,'import-results.json'),JSON.stringify(out,null,2));
```

## local-report.cts

```typescript
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const root='/Users/sox/Desktop/SouthernStar';const temp='/private/tmp/southernstar-tax-audit-20261015';process.env.NORTH_STAR_DATA_FILE=path.join(root,'.north-star/data.json');
const {LocalStorageAdapter}=require(path.join(root,'lib/storage/local.ts'));const {buildEofyReport,eofyReportCsv}=require(path.join(root,'lib/reports/eofy.ts'));
(async()=>{const file=process.env.NORTH_STAR_DATA_FILE;const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');const before=hash();const a=new LocalStorageAdapter();const [d,t,p,profiles]=await Promise.all([a.dashboard('personal'),a.listTransactions('PERSONAL'),a.listPriceBook(2000),a.listTaxProfiles()]);const election=profiles.find(x=>x.ownerType==='PERSONAL').parcelSelection;const r=buildEofyReport('personal',d,t,2026,new Date('2026-10-15T01:00:00Z'),p,{pensionPhase:false},election);const csv=eofyReportCsv(r);
const out={snapshotSha256:before,unchangedAfterRead:before===hash(),transactionCount:t.length,holdingCount:d.holdings.length,priceRows:p.prices.length,fxRows:p.fxRates.length,method:election,financialYear:r.financialYear,realisedLots:r.realisedLots.length,unmatchedLots:r.realisedLots.filter(x=>!x.acquisitionDate).length,netCapitalGainAud:r.summary.taxableRealisedAud,reconciliationStatus:r.reconciliation.status,reconciliationReview:r.reconciliation.rows.filter(x=>x.status==='review').map(x=>({check:x.check,varianceAud:x.varianceAud,detail:x.detail})),grossIncomeAud:r.summary.grossIncomeAud,dividendPayments:r.incomePayments.length,missingHistoricalValuations:r.historicalCost.filter(x=>x.closingValuationStatus==='missing_price'||x.closingValuationStatus==='missing_fx').length,csvContainsRoundedSummary:csv.includes(r.summary.taxableRealisedAud.toFixed(2)),sameInputsSameCsv:csv===eofyReportCsv(buildEofyReport('personal',d,t,2026,new Date('2026-10-15T01:00:00Z'),p,{pensionPhase:false},election))};console.log(JSON.stringify(out));fs.writeFileSync(path.join(temp,'local-report-results.json'),JSON.stringify(out,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
```

