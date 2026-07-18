import { getStorage } from "@/lib/storage";
import {
  buildEofyReport,
  eofyReportCsv,
  eofyScopeFromRequest,
  financialYearFromRequest,
  ownerTypeForEofyScope,
} from "@/lib/reports/eofy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = eofyScopeFromRequest(url.searchParams.get("scope"));
    const year = financialYearFromRequest(url.searchParams.get("year"));
    const format = url.searchParams.get("format");
    const storage = getStorage();
    const ownerType = ownerTypeForEofyScope(scope);
    const [dashboard, transactions] = await Promise.all([
      storage.dashboard(scope),
      storage.listTransactions(ownerType),
    ]);
    const report = buildEofyReport(scope, dashboard, transactions, year);

    if (format === "csv") {
      const body = eofyReportCsv(report);
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="northstar-eofy-accountant-pack-${scope}-fy${year}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to generate EOFY report" }, { status: 500 });
  }
}
