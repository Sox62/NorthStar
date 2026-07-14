import type {BrokerAdapter,ImportedTransaction} from "./types";
export class SharesightAdapter implements BrokerAdapter{name="Sharesight OAuth";async importTransactions(_from:string,_to:string):Promise<ImportedTransaction[]>{if(!process.env.SHARESIGHT_CLIENT_ID)return [];throw new Error("Sharesight OAuth credentials configured; complete callback registration before enabling sync.")}}
