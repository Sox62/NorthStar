import {IbkrFlexAdapter} from "../lib/integrations/ibkr";
import {SharesightAdapter} from "../lib/integrations/sharesight";
async function main(){const today=new Date().toISOString().slice(0,10);const adapters=[new IbkrFlexAdapter(),new SharesightAdapter()];console.log(`[sync] ${today} starting`);for(const adapter of adapters){try{const rows=await adapter.importTransactions(today,today);console.log(`[sync] ${adapter.name}: ${rows.length} rows`)}catch(error){console.error(`[sync] ${adapter.name}:`,error)}}console.log("[sync] price, FX, valuation and snapshot stages scaffolded");}
main().catch(e=>{console.error(e);process.exit(1)});
