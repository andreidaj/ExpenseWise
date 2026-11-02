import { asList, asRecord, asString } from "@/lib/format";
import { api, apiBlob } from "@/lib/http";
import {
  normalizeAccount,
  normalizeBudget,
  normalizeCategory,
  normalizeDebt,
  normalizeGoal,
  normalizeGrant,
  normalizeImportPreview,
  normalizeMember,
  normalizeReceipt,
  normalizeRecurring,
  normalizeReport,
  normalizeSpace,
  normalizeTransaction,
  normalizeUser,
} from "@/lib/normalize";
import type { ReportModel, ReportView } from "@/lib/types";

function list<T>(data: unknown, map: (row: unknown) => T | null): T[] {
  return asList(data)
    .map(map)
    .filter((row): row is T => Boolean(row));
}

export const resources = {
  me: () => api("/api/me").then(normalizeUser),
  patchMe: (body: { display_name?: string; report_view?: ReportView; base_currency?: string; period_start_day?: number }) =>
    api("/api/me", { method: "PATCH", json: body }).then(normalizeUser),
  exportBlob: () => apiBlob("/api/export"),

  spaces: () => api("/api/spaces").then((data) => list(data, normalizeSpace)),
  space: (id: string) => api(`/api/spaces/${id}`).then(normalizeSpace),
  createSpace: (body: {
    name: string;
    kind: "family" | "project";
    base_currency: string;
    starts_on?: string | null;
    ends_on?: string | null;
  }) => api("/api/spaces", { method: "POST", json: body }).then(normalizeSpace),
  patchSpace: (id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${id}`, { method: "PATCH", json: body }).then(normalizeSpace),
  deleteSpace: (id: string) => api(`/api/spaces/${id}`, { method: "DELETE" }),

  members: (spaceId: string) => api(`/api/spaces/${spaceId}/members`).then((data) => list(data, normalizeMember)),
  patchMember: (spaceId: string, userId: string, role: string) =>
    api(`/api/spaces/${spaceId}/members/${userId}`, { method: "PATCH", json: { role } }),
  removeMember: (spaceId: string, userId: string) =>
    api(`/api/spaces/${spaceId}/members/${userId}`, { method: "DELETE" }),
  invite: (spaceId: string, body: { email: string; role: string }) =>
    api(`/api/spaces/${spaceId}/invitations`, { method: "POST", json: body }),
  acceptInvite: (token: string) => api("/api/invitations/accept", { method: "POST", json: { token } }),

  accounts: (spaceId: string) => api(`/api/spaces/${spaceId}/accounts`).then((data) => list(data, normalizeAccount)),
  createAccount: (spaceId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/accounts`, { method: "POST", json: body }).then(normalizeAccount),
  patchAccount: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/accounts/${id}`, { method: "PATCH", json: body }).then(normalizeAccount),
  deleteAccount: (spaceId: string, id: string) => api(`/api/spaces/${spaceId}/accounts/${id}`, { method: "DELETE" }),
  balances: async (spaceId: string) => {
    const data = await api(`/api/spaces/${spaceId}/balances`);
    return asList(data).map((row) => {
      const record = asRecord(row);
      return {
        account_id: asString(record.account_id) || asString(record.id) || "",
        balance: asString(record.balance) || "0",
        currency: (asString(record.currency) || "").toUpperCase(),
        name: asString(record.name),
      };
    });
  },

  categories: (spaceId: string) =>
    api(`/api/spaces/${spaceId}/categories`).then((data) => list(data, normalizeCategory)),
  createCategory: (spaceId: string, body: { name: string; kind: "income" | "expense"; group_name: string }) =>
    api(`/api/spaces/${spaceId}/categories`, { method: "POST", json: body }).then(normalizeCategory),
  patchCategory: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/categories/${id}`, { method: "PATCH", json: body }).then(normalizeCategory),
  deleteCategory: (spaceId: string, id: string) =>
    api(`/api/spaces/${spaceId}/categories/${id}`, { method: "DELETE" }),

  transactions: (spaceId: string, query?: { from?: string; to?: string; kind?: string }) =>
    api(`/api/spaces/${spaceId}/transactions`, { query }).then((data) => list(data, normalizeTransaction)),
  transaction: (spaceId: string, id: string) =>
    api(`/api/spaces/${spaceId}/transactions/${id}`).then(normalizeTransaction),
  createTransaction: (spaceId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/transactions`, { method: "POST", json: body }).then(normalizeTransaction),
  patchTransaction: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/transactions/${id}`, { method: "PATCH", json: body }).then(normalizeTransaction),
  deleteTransaction: (spaceId: string, id: string) =>
    api(`/api/spaces/${spaceId}/transactions/${id}`, { method: "DELETE" }),

  recurring: (spaceId: string) =>
    api(`/api/spaces/${spaceId}/recurring-rules`).then((data) => list(data, normalizeRecurring)),
  createRecurring: (spaceId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/recurring-rules`, { method: "POST", json: body }).then(normalizeRecurring),
  patchRecurring: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/recurring-rules/${id}`, { method: "PATCH", json: body }).then(normalizeRecurring),
  deleteRecurring: (spaceId: string, id: string) =>
    api(`/api/spaces/${spaceId}/recurring-rules/${id}`, { method: "DELETE" }),

  budgets: (spaceId: string, query: { year: number; month: number; from?: string; to?: string }) =>
    api(`/api/spaces/${spaceId}/budgets`, {
      query: {
        year: String(query.year),
        month: String(query.month),
        from: query.from,
        to: query.to,
      },
    }).then((data) => list(data, normalizeBudget)),
  createBudget: (spaceId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/budgets`, { method: "POST", json: body }).then(normalizeBudget),
  patchBudget: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/budgets/${id}`, { method: "PATCH", json: body }).then(normalizeBudget),
  deleteBudget: (spaceId: string, id: string) => api(`/api/spaces/${spaceId}/budgets/${id}`, { method: "DELETE" }),

  goals: (spaceId: string) => api(`/api/spaces/${spaceId}/goals`).then((data) => list(data, normalizeGoal)),
  createGoal: (spaceId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/goals`, { method: "POST", json: body }).then(normalizeGoal),
  patchGoal: (spaceId: string, id: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/goals/${id}`, { method: "PATCH", json: body }).then(normalizeGoal),
  deleteGoal: (spaceId: string, id: string) => api(`/api/spaces/${spaceId}/goals/${id}`, { method: "DELETE" }),

  report: async (options: { spaceId?: string; from: string; to: string; view: ReportView }): Promise<ReportModel> => {
    const query: Record<string, string> = { from: options.from, to: options.to };
    if (options.spaceId) query.space_id = options.spaceId;
    if (options.view === "separate") {
      const separate = normalizeReport(await api("/api/reports", { query }));
      return { ...separate, consolidated: null };
    }
    const [separateRaw, consolidatedRaw] = await Promise.all([
      api("/api/reports", { query }),
      api("/api/reports", { query: { ...query, currency: "RON" } }),
    ]);
    const separate = normalizeReport(separateRaw);
    const consolidated = normalizeReport(consolidatedRaw);
    const consolidatedTotal =
      consolidated.consolidated ??
      (consolidated.byCurrency.length === 1 && consolidated.byCurrency[0].currency === "RON"
        ? {
            income: consolidated.byCurrency[0].income,
            expense: consolidated.byCurrency[0].expense,
            missingFx: consolidated.byCurrency.filter((row) => row.missingFx).length,
          }
        : separate.consolidated);
    return {
      byCurrency: separate.byCurrency.length ? separate.byCurrency : consolidated.byCurrency,
      categories: consolidated.categories.length ? consolidated.categories : separate.categories,
      series: consolidated.series.length ? consolidated.series : separate.series,
      consolidated: consolidatedTotal,
    };
  },

  previewImport: (spaceId: string, form: FormData) =>
    api(`/api/spaces/${spaceId}/imports`, { method: "POST", form }).then(normalizeImportPreview),
  confirmImport: (spaceId: string, batchId: string, includeRowIds: string[]) =>
    api(`/api/spaces/${spaceId}/imports/${batchId}/confirm`, {
      method: "POST",
      json: { include_row_ids: includeRowIds },
    }),

  uploadReceipt: (spaceId: string, form: FormData) =>
    api(`/api/spaces/${spaceId}/receipts`, { method: "POST", form }).then(normalizeReceipt),
  saveReceipt: (spaceId: string, draftId: string, body: Record<string, unknown>) =>
    api(`/api/spaces/${spaceId}/receipts/${draftId}/save`, { method: "POST", json: body }),

  consent: (requestId: string) => api(`/api/asistent/autorizare/${requestId}`),
  decideConsent: (requestId: string, allow: boolean) =>
    api(`/api/asistent/autorizare/${requestId}`, { method: "POST", json: { allow } }),
  grants: () => api("/api/asistent/conexiuni").then((data) => list(data, normalizeGrant)),
  revokeGrant: (id: string) => api(`/api/asistent/conexiuni/${id}`, { method: "DELETE" }),

  debts: (spaceId: string) => api(`/api/spaces/${spaceId}/debts`).then((data) => list(data, normalizeDebt)),
  createDebt: (spaceId: string, body: { person_name: string; amount: string; account_id: string; occurred_on: string; note?: string }) =>
    api(`/api/spaces/${spaceId}/debts`, { method: "POST", json: body }).then(normalizeDebt),
  repayDebt: (spaceId: string, debtId: string, body: { amount: string; account_id: string; occurred_on: string }) =>
    api(`/api/spaces/${spaceId}/debts/${debtId}/repayments`, { method: "POST", json: body }).then(normalizeDebt),
  deleteDebt: (spaceId: string, debtId: string) => api(`/api/spaces/${spaceId}/debts/${debtId}`, { method: "DELETE" }),
};
