import { getStorage } from "@/lib/storage";
import {
  buildEofyReport,
  eofyReportCsv,
  financialYearFromRequest,
} from "@/lib/reports/eofy";
import { eofyReportXlsx } from "@/lib/reports/eofy-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope");
    if (requestedScope && requestedScope !== "personal") {
      return Response.json({ error: "EOFY accountant tax packs are personal-only. SMSF is reported separately by the SMSF accountant." }, { status: 400 });
    }
    const scope = "personal";
    const year = financialYearFromRequest(url.searchParams.get("year"));
    const format = url.searchParams.get("format");
    const storage = getStorage();
    const [dashboard, transactions] = await Promise.all([
      storage.dashboard(scope),
      storage.listTransactions("PERSONAL"),
    ]);
    const report = buildEofyReport(scope, dashboard, transactions, year);

    if (format === "xlsx") {
      const body = eofyReportXlsx(report);
      return new Response(body, {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="northstar-personal-eofy-accountant-pack-fy${year}.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }

    if (format === "csv") {
      const body = eofyReportCsv(report);
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="northstar-personal-eofy-accountant-pack-fy${year}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to generate EOFY report" }, { status: 500 });
  }
}
