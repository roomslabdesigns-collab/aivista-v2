import { Download, Trash2 } from "lucide-react";
import type { Report } from "../../shared/types";
import { api } from "../api";
import { Badge, Card, PageHeader } from "../components/ui";
import { useApp } from "../state";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function toCsv(r: Report) {
  const header = ["query", "intent", "model", "provider", "target_position", "brands_mentioned", "cited_domains", "error"];
  const rows = r.responses.map((x) => {
    const q = r.queries.find((q) => q.id === x.queryId);
    return [
      q?.text, q?.intent, x.modelName, x.provider,
      x.mentions.find((m) => m.brand === r.company.companyName)?.position ?? "",
      x.mentions.map((m) => `${m.position}. ${m.brand}`).join("; "),
      x.citations.map((c) => c.domain).join("; "),
      x.error,
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function Reports() {
  const { analyses, currentId, select, remove } = useApp();

  const exportRun = async (id: string, format: "json" | "csv") => {
    const d = await api.get(id);
    if (!d.report) return;
    const base = `aivista-${d.summary.domain}-${d.summary.createdAt.slice(0, 10)}`;
    if (format === "json") download(`${base}.json`, JSON.stringify(d.report, null, 2), "application/json");
    else download(`${base}.csv`, toCsv(d.report), "text/csv");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Every investigation run. Re-run the same company over time to measure real impact." />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              {["Company", "Domain", "Date", "Mode", "Status", ""].map((h) => <th key={h} className="px-6 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {analyses.map((a) => (
              <tr key={a.id} className={a.id === currentId ? "border-t border-slate-100 bg-brand-50/50" : "border-t border-slate-100"}>
                <td className="px-6 py-3"><button onClick={() => select(a.id)} className="font-medium text-brand-700 hover:underline">{a.companyName}</button></td>
                <td className="px-6 py-3 text-slate-600">{a.domain}</td>
                <td className="px-6 py-3 text-slate-600">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="px-6 py-3"><Badge tone={a.mode === "live" ? "green" : "amber"}>{a.mode}</Badge></td>
                <td className="px-6 py-3">
                  <Badge tone={a.status === "completed" ? "green" : a.status === "failed" ? "red" : "blue"}>{a.status}</Badge>
                </td>
                <td className="px-6 py-3">
                  <div className="flex justify-end gap-1">
                    {a.status === "completed" && (
                      <>
                        <button onClick={() => exportRun(a.id, "csv")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"><Download className="size-3.5" />CSV</button>
                        <button onClick={() => exportRun(a.id, "json")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"><Download className="size-3.5" />JSON</button>
                      </>
                    )}
                    <button onClick={() => confirm(`Delete the ${a.companyName} analysis?`) && remove(a.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!analyses.length && <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No analyses yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
