/**
 * Pension phase belongs to a superannuation fund, and to nothing else.
 *
 * Exempt current pension income is a feature of a complying fund paying a retirement phase income
 * stream. An individual does not have it, at any age, under any circumstances — so a Personal book
 * carrying the flag is not a configuration choice, it is a mistake, and an expensive one: it
 * reports every personal capital gain as untaxed.
 *
 * The flag was settable on Personal through the API, the storage layer and the tax workbench's own
 * switch, and the tax surfaces trusted whatever they found. Reading is coerced as well as writing,
 * so a value already stored against a Personal book cannot take effect while it is being cleaned
 * up — the number stops being wrong immediately rather than after a migration.
 */
export function pensionPhaseApplies(ownerType: string) {
  return ownerType === "SMSF";
}

/** The treatment actually in force, whatever a store happens to hold. */
export function pensionPhaseFor(ownerType: string, stored: boolean | null | undefined) {
  return pensionPhaseApplies(ownerType) && stored === true;
}
