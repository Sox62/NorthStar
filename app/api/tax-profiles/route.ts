import { NextResponse } from "next/server";
import { z } from "zod";
import { parcelSelectionLabels, parcelSelectionMethods } from "@/lib/parcel-selection";
import { pensionPhaseApplies } from "@/lib/pension-phase";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const methodSchema = z.enum(parcelSelectionMethods);

/**
 * Either setting may be sent, and at least one must be. They are independent — pension phase is a
 * fact about the fund, the parcel election is a choice about matching — so sending one must not
 * quietly reset the other, which is what a single required shape would do.
 */
const inputSchema = z.object({
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  pensionPhase: z.boolean().optional(),
  parcelSelection: z.object({
    method: methodSchema,
    /** Keyed "SYMBOL:EXCHANGE". The election belongs to the security, not the account. */
    overrides: z.record(z.string().min(1), methodSchema).optional(),
  }).optional(),
}).refine(
  (input) => input.pensionPhase !== undefined || input.parcelSelection !== undefined,
  { message: "Send pensionPhase, parcelSelection, or both." },
).refine(
  /*
   * Refused rather than quietly coerced. Exempt current pension income belongs to a complying
   * fund; an individual never has it, so a request to put a Personal book in pension phase is a
   * mistake worth naming — it would report every personal capital gain as untaxed.
   */
  (input) => !input.pensionPhase || pensionPhaseApplies(input.ownerType),
  { message: "Pension phase applies to the SMSF only. An individual cannot hold exempt current pension income." },
);

export async function GET() {
  try {
    return NextResponse.json({ profiles: await getStorage().listTaxProfiles(), methods: parcelSelectionLabels });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tax profiles" },
      { status: 500 },
    );
  }
}

/**
 * Sets how a legal book is taxed: whether it is in pension phase, which decides whether its capital
 * gains are taxable at all, and which parcels a disposal consumes, which decides how large the gain
 * is. Both change reported tax figures rather than any underlying record, so they are settings
 * rather than imports, and the tax surfaces read them on every build.
 */
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const storage = getStorage();
    const bookLabel = input.ownerType === "SMSF" ? "SMSF" : "Personal";
    const messages: string[] = [];

    let profile = (await storage.listTaxProfiles()).find((item) => item.ownerType === input.ownerType);

    if (input.pensionPhase !== undefined) {
      profile = await storage.setTaxProfile(input.ownerType, input.pensionPhase);
      messages.push(input.pensionPhase
        ? `${bookLabel} is in pension phase: capital gains are exempt current pension income.`
        : `${bookLabel} is in accumulation phase: capital gains are taxable, with the discount where held over twelve months.`);
    }

    if (input.parcelSelection) {
      profile = await storage.setParcelSelection(input.ownerType, input.parcelSelection);
      const overrides = Object.entries(input.parcelSelection.overrides ?? {});
      messages.push(
        `${bookLabel} disposals match parcels by ${parcelSelectionLabels[input.parcelSelection.method].toLowerCase()}`
        + (overrides.length
          ? `, except ${overrides.map(([holding, method]) => `${holding} (${parcelSelectionLabels[method].toLowerCase()})`).join(", ")}.`
          : ".")
        // Said plainly because it is the one setting here that changes a gain without changing a
        // single record, and a reader needs to know the figures moved under them.
        + " Reported gains on past disposals change with this.",
      );
    }

    return NextResponse.json({ profile, message: messages.join(" ") });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update tax profile" },
      { status: 400 },
    );
  }
}
