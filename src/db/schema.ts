import {
  pgTable, uuid, text, boolean, integer, bigint, timestamp, date, jsonb, bigserial,
  primaryKey, uniqueIndex, index, pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money is always stored as integer minor units (cents) in a bigint column.
const money = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("jv_role", [
  "cto",
  "project_coordinator",
  "finance_officer",
  "finance_clerk",
  "partner_viewer",
  "director",
]);

export const entryTypeEnum = pgEnum("entry_type", [
  "opening_balance",
  "drawdown",
  "income_applied_offset",
  "advance_refund",
  "receipt",
  "conversion_out",
  "conversion_in",
  "reversal",
]);

// ---------------------------------------------------------------- identity

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  title: text("title"),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  twoFactorPassed: boolean("two_factor_passed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
});

// ---------------------------------------------------------------- JVs

export const jvs = pgTable("jvs", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(), // subdomain / URL slug, e.g. "bullion"
  shortCode: text("short_code").notNull(), // numbering prefix, e.g. "BT"
  name: text("name").notNull(),
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  vatNo: text("vat_no"),
  bpNo: text("bp_no"),
  tin: text("tin"),
  taxClearanceNo: text("tax_clearance_no"),
  taxClearanceExpiry: date("tax_clearance_expiry"),
  vatRateBp: integer("vat_rate_bp").notNull().default(0), // basis points, 1550 = 15.5%
  fundingPartner: text("funding_partner").notNull(),
  currencies: text("currencies").array().notNull().default(sql`ARRAY['USD']::text[]`),
  acquittalDays: integer("acquittal_days").notNull().default(14),
  goLiveDate: date("go_live_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("jvs_code_uq").on(t.code), uniqueIndex("jvs_short_code_uq").on(t.shortCode)]);

export const jvBankAccounts = pgTable("jv_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  accountName: text("account_name").notNull(),
  bank: text("bank").notNull(),
  details: text("details").notNull(),
  currency: text("currency").notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("projects_jv_name_uq").on(t.jvId, t.name)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("categories_jv_name_uq").on(t.jvId, t.name)]);

export const budgets = pgTable("budgets", {
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  currency: text("currency").notNull(),
  monthlyAmount: money("monthly_amount").notNull(),
}, (t) => [primaryKey({ columns: [t.jvId, t.currency] })]);

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("memberships_uq").on(t.userId, t.jvId, t.role)]);

export const sequences = pgTable("sequences", {
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  docType: text("doc_type").notNull(),
  year: integer("year").notNull(),
  next: integer("next").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.jvId, t.docType, t.year] })]);

// ---------------------------------------------------------------- spend

export const requisitions = pgTable("requisitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  status: text("status").notNull().default("draft"),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  requesterRole: roleEnum("requester_role").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  categoryId: uuid("category_id").references(() => categories.id),
  currency: text("currency").notNull(),
  urgency: text("urgency").notNull().default("normal"),
  requiredBy: date("required_by"),
  justification: text("justification"),
  payee: text("payee").notNull(),
  endSupplier: text("end_supplier"),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  payeeBankDetails: text("payee_bank_details"),
  payFrom: text("pay_from").notNull().default("funding_partner"),
  total: money("total").notNull().default(0),
  isHistorical: boolean("is_historical").notNull().default(false),
  historicalDate: date("historical_date"),
  historicalDescription: text("historical_description"),
  reviewFlags: text("review_flags"),
  supportingDocs: text("supporting_docs"),
  importBatchId: uuid("import_batch_id"),
  parentRequisitionId: uuid("parent_requisition_id"),
  disbursedById: uuid("disbursed_by_id").references(() => users.id),
  disbursedAt: date("disbursed_at"),
  disbursementMethod: text("disbursement_method"),
  disbursementRef: text("disbursement_ref"),
  approvedById: uuid("approved_by_id").references(() => users.id),
  acquittalActual: money("acquittal_actual"),
  acquittalChange: money("acquittal_change"),
  acquittalNote: text("acquittal_note"),
  acquittalSubmittedAt: timestamp("acquittal_submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("requisitions_number_uq").on(t.jvId, t.number), index("requisitions_jv_status").on(t.jvId, t.status)]);

export const requisitionLines = pgTable("requisition_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  requisitionId: uuid("requisition_id").notNull().references(() => requisitions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unitCost: money("unit_cost").notNull(),
  lineTotal: money("line_total").notNull(),
});

/** Approval and workflow history for any document. */
export const documentEvents = pgTable("document_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  docType: text("doc_type").notNull(),
  docId: uuid("doc_id").notNull(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  comment: text("comment"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("document_events_doc").on(t.docType, t.docId)]);

export const supplierInvoices = pgTable("supplier_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  supplier: text("supplier").notNull(),
  supplierInvoiceNo: text("supplier_invoice_no").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  currency: text("currency").notNull(),
  total: money("total").notNull(),
  disputed: boolean("disputed").notNull().default(false),
  disputeComment: text("dispute_comment"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("supplier_invoices_uq").on(t.jvId, sql`lower(${t.supplier})`, t.supplierInvoiceNo)]);

export const supplierInvoiceLines = pgTable("supplier_invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierInvoiceId: uuid("supplier_invoice_id").notNull().references(() => supplierInvoices.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
});

/** Payments (requisitions) allocated against supplier invoices. */
export const supplierPayments = pgTable("supplier_payments", {
  requisitionId: uuid("requisition_id").notNull().references(() => requisitions.id),
  supplierInvoiceId: uuid("supplier_invoice_id").notNull().references(() => supplierInvoices.id),
  amount: money("amount").notNull(),
}, (t) => [primaryKey({ columns: [t.requisitionId, t.supplierInvoiceId] })]);

// ---------------------------------------------------------------- income

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  vatNo: text("vat_no"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("clients_jv_name_uq").on(t.jvId, sql`lower(${t.name})`)]);

export const invoiceRequests = pgTable("invoice_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  status: text("status").notNull().default("draft"),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  requesterRole: roleEnum("requester_role").notNull(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  requestedDueDate: date("requested_due_date"),
  invoiceId: uuid("invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("invoice_requests_number_uq").on(t.jvId, t.number)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  kind: text("kind").notNull().default("native"), // native | external
  number: text("number").notNull(),
  sourceSystem: text("source_system"),
  externalNumber: text("external_number"),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  currency: text("currency").notNull(),
  subtotal: money("subtotal").notNull().default(0),
  vatTotal: money("vat_total").notNull().default(0),
  total: money("total").notNull().default(0),
  fiscalInvoiceNo: text("fiscal_invoice_no"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  invoiceRequestId: uuid("invoice_request_id"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  issuedById: uuid("issued_by_id").references(() => users.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("invoices_number_uq").on(t.jvId, t.number),
  uniqueIndex("invoices_external_uq").on(t.jvId, t.sourceSystem, t.externalNumber).where(sql`${t.kind} = 'external'`),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unitPrice: money("unit_price").notNull(),
  vatRateBp: integer("vat_rate_bp").notNull().default(0),
  lineNet: money("line_net").notNull(),
  lineVat: money("line_vat").notNull(),
});

export const creditNotes = pgTable("credit_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  noteDate: date("note_date").notNull(),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("credit_notes_number_uq").on(t.jvId, t.number)]);

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  receivedDate: date("received_date").notNull(),
  currency: text("currency").notNull(),
  amount: money("amount").notNull(),
  method: text("method").notNull(),
  bankRef: text("bank_ref"),
  recordedById: uuid("recorded_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("receipts_number_uq").on(t.jvId, t.number)]);

export const receiptAllocations = pgTable("receipt_allocations", {
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amount: money("amount").notNull(),
}, (t) => [primaryKey({ columns: [t.receiptId, t.invoiceId] })]);

/** Which receipts funded a requisition paid from JV income (FIFO). */
export const incomeApplications = pgTable("income_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  requisitionId: uuid("requisition_id").notNull().references(() => requisitions.id),
  receiptId: uuid("receipt_id").references(() => receipts.id),
  conversionId: uuid("conversion_id"),
  amount: money("amount").notNull(),
  active: boolean("active").notNull().default(true),
});

export const conversions = pgTable("conversions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  conversionDate: date("conversion_date").notNull(),
  fromCurrency: text("from_currency").notNull(),
  fromAmount: money("from_amount").notNull(),
  toCurrency: text("to_currency").notNull(),
  toAmount: money("to_amount").notNull(),
  rate: text("rate").notNull(),
  note: text("note"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("conversions_number_uq").on(t.jvId, t.number)]);

// ---------------------------------------------------------------- ledger

/**
 * Immutable. UPDATE and DELETE are blocked by a database trigger (see migration 0001_ledger_guard).
 * loanDelta: + increases what the JV owes the funding partner, - reduces it.
 * incomeDelta: + increases JV income held by the funding partner, - reduces it.
 */
export const ledgerEntries = pgTable("ledger_entries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  entryDate: date("entry_date").notNull(),
  currency: text("currency").notNull(),
  type: entryTypeEnum("type").notNull(),
  loanDelta: money("loan_delta").notNull().default(0),
  incomeDelta: money("income_delta").notNull().default(0),
  description: text("description").notNull(),
  reference: text("reference").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  reversesEntryId: bigint("reverses_entry_id", { mode: "number" }),
  changeRequestId: uuid("change_request_id"),
  priorPeriodAdjustment: boolean("prior_period_adjustment").notNull().default(false),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ledger_jv_currency_date").on(t.jvId, t.currency, t.entryDate),
  index("ledger_source").on(t.sourceType, t.sourceId),
  uniqueIndex("ledger_single_reversal_uq").on(t.reversesEntryId),
]);

export const periods = pgTable("periods", {
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  yearMonth: text("year_month").notNull(), // "2026-11"
  closedById: uuid("closed_by_id").notNull().references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.jvId, t.yearMonth] })]);

// ---------------------------------------------------------------- controls

export const changeRequests = pgTable("change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  number: text("number").notNull(),
  targetType: text("target_type").notNull(), // requisition | receipt | invoice | supplier_invoice
  targetId: uuid("target_id").notNull(),
  targetLabel: text("target_label").notNull(),
  changes: jsonb("changes").notNull().$type<Record<string, { from: unknown; to: unknown }>>(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  proposerId: uuid("proposer_id").notNull().references(() => users.id),
  proposerRole: roleEnum("proposer_role").notNull(),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
  deciderId: uuid("decider_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionComment: text("decision_comment"),
}, (t) => [uniqueIndex("change_requests_number_uq").on(t.jvId, t.number), index("change_requests_target").on(t.targetType, t.targetId)]);

export type ImportRow = {
  entryRef: string; date: string; currency: string; payee: string; endSupplier: string;
  description: string; category: string; project: string; amount: number; payFrom: string;
  requisitionRef: string; receiptRef: string; supportingDocs: string; reviewFlags: string;
};

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  filename: text("filename").notNull(),
  rows: jsonb("rows").notNull().$type<ImportRow[]>(),
  totals: jsonb("totals").notNull().$type<Record<string, number>>(),
  status: text("status").notNull().default("pending"),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  uploadedRole: roleEnum("uploaded_role").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  decidedById: uuid("decided_by_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionComment: text("decision_comment"),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  jvId: uuid("jv_id").notNull().references(() => jvs.id),
  ownerType: text("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("attachments_owner").on(t.ownerType, t.ownerId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  jvId: uuid("jv_id").references(() => jvs.id),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  emailed: boolean("emailed").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_user").on(t.userId, t.readAt)]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid("actor_id"),
  jvId: uuid("jv_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
}, (t) => [index("audit_jv_at").on(t.jvId, t.at)]);

export type Role = (typeof roleEnum.enumValues)[number];
export type EntryType = (typeof entryTypeEnum.enumValues)[number];
