export function classifyAsset(symbol: string, name: string) {
  const text = `${symbol} ${name}`.toUpperCase();
  if (/^VELO\b|VELOCITY|TECH|SOFTWARE|DIGITAL|SEMICONDUCTOR/.test(text)) return "Technology";
  if (/^LAM\b|LARAMIDE|U3O8|U308|URANIUM EXPLOR/.test(text)) return "Uranium";
  if (/SILVER|GOLD|RHODIUM|PLATINUM|PRECIOUS|ETPMAG|SILJ|SLVM|XRH0|CDE|HL|AYA|EDR|SCZ/.test(text)) return "Precious metals";
  if (/URANIUM|NUCLEAR|ATOM|URA|URNM|UUUU|CCJ|DML|DYL|NXG|NUKZ/.test(text)) return "Uranium";
  if (/OIL|ENERGY|ECOPETROL|PETROL|EC$/.test(text)) return "Energy";
  if (/CASH/.test(text)) return "Cash";
  return "Broad equities";
}
