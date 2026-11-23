CREATE TYPE "public"."entry_type" AS ENUM('opening_balance', 'drawdown', 'income_applied_offset', 'advance_refund', 'receipt', 'conversion_out', 'conversion_in', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."jv_role" AS ENUM('cto', 'project_coordinator', 'finance_officer', 'finance_clerk', 'partner_viewer', 'director');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"jv_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"jv_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"monthly_amount" bigint NOT NULL,
	CONSTRAINT "budgets_jv_id_currency_pk" PRIMARY KEY("jv_id","currency")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_label" text NOT NULL,
	"changes" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposer_id" uuid NOT NULL,
	"proposer_role" "jv_role" NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decider_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"vat_no" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"conversion_date" date NOT NULL,
	"from_currency" text NOT NULL,
	"from_amount" bigint NOT NULL,
	"to_currency" text NOT NULL,
	"to_amount" bigint NOT NULL,
	"rate" text NOT NULL,
	"note" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"note_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"jv_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"doc_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_role" text,
	"action" text NOT NULL,
	"comment" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"rows" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"uploaded_role" "jv_role" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text
);
--> statement-breakpoint
CREATE TABLE "income_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"receipt_id" uuid,
	"conversion_id" uuid,
	"amount" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit_price" bigint NOT NULL,
	"vat_rate_bp" integer DEFAULT 0 NOT NULL,
	"line_net" bigint NOT NULL,
	"line_vat" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requester_id" uuid NOT NULL,
	"requester_role" "jv_role" NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"requested_due_date" date,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"kind" text DEFAULT 'native' NOT NULL,
	"number" text NOT NULL,
	"source_system" text,
	"external_number" text,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date,
	"currency" text NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"vat_total" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"fiscal_invoice_no" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"invoice_request_id" uuid,
	"created_by_id" uuid NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jv_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"account_name" text NOT NULL,
	"bank" text NOT NULL,
	"details" text NOT NULL,
	"currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jvs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"short_code" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text NOT NULL,
	"company_address" text,
	"company_phone" text,
	"company_email" text,
	"vat_no" text,
	"bp_no" text,
	"tin" text,
	"tax_clearance_no" text,
	"tax_clearance_expiry" date,
	"vat_rate_bp" integer DEFAULT 0 NOT NULL,
	"funding_partner" text NOT NULL,
	"currencies" text[] DEFAULT ARRAY['USD']::text[] NOT NULL,
	"acquittal_days" integer DEFAULT 14 NOT NULL,
	"go_live_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"jv_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"currency" text NOT NULL,
	"type" "entry_type" NOT NULL,
	"loan_delta" bigint DEFAULT 0 NOT NULL,
	"income_delta" bigint DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"reference" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"reverses_entry_id" bigint,
	"change_request_id" uuid,
	"prior_period_adjustment" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jv_id" uuid NOT NULL,
	"role" "jv_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jv_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"emailed" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"jv_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"closed_by_id" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periods_jv_id_year_month_pk" PRIMARY KEY("jv_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_allocations" (
	"receipt_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "receipt_allocations_receipt_id_invoice_id_pk" PRIMARY KEY("receipt_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"received_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"bank_ref" text,
	"recorded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit_cost" bigint NOT NULL,
	"line_total" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requester_id" uuid NOT NULL,
	"requester_role" "jv_role" NOT NULL,
	"project_id" uuid,
	"category_id" uuid,
	"currency" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"required_by" date,
	"justification" text,
	"payee" text NOT NULL,
	"end_supplier" text,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL,
	"payee_bank_details" text,
	"pay_from" text DEFAULT 'funding_partner' NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"is_historical" boolean DEFAULT false NOT NULL,
	"historical_date" date,
	"historical_description" text,
	"review_flags" text,
	"supporting_docs" text,
	"import_batch_id" uuid,
	"parent_requisition_id" uuid,
	"disbursed_by_id" uuid,
	"disbursed_at" date,
	"disbursement_method" text,
	"disbursement_ref" text,
	"approved_by_id" uuid,
	"acquittal_actual" bigint,
	"acquittal_change" bigint,
	"acquittal_note" text,
	"acquittal_submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"jv_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"year" integer NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sequences_jv_id_doc_type_year_pk" PRIMARY KEY("jv_id","doc_type","year")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"two_factor_passed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_invoice_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jv_id" uuid NOT NULL,
	"supplier" text NOT NULL,
	"supplier_invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"currency" text NOT NULL,
	"total" bigint NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"dispute_comment" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"requisition_id" uuid NOT NULL,
	"supplier_invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "supplier_payments_requisition_id_supplier_invoice_id_pk" PRIMARY KEY("requisition_id","supplier_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decider_id_users_id_fk" FOREIGN KEY ("decider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_applications" ADD CONSTRAINT "income_applications_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_applications" ADD CONSTRAINT "income_applications_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_applications" ADD CONSTRAINT "income_applications_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jv_bank_accounts" ADD CONSTRAINT "jv_bank_accounts_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_disbursed_by_id_users_id_fk" FOREIGN KEY ("disbursed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_jv_id_jvs_id_fk" FOREIGN KEY ("jv_id") REFERENCES "public"."jvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_jv_at" ON "audit_log" USING btree ("jv_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_jv_name_uq" ON "categories" USING btree ("jv_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_number_uq" ON "change_requests" USING btree ("jv_id","number");--> statement-breakpoint
CREATE INDEX "change_requests_target" ON "change_requests" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_jv_name_uq" ON "clients" USING btree ("jv_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "conversions_number_uq" ON "conversions" USING btree ("jv_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_uq" ON "credit_notes" USING btree ("jv_id","number");--> statement-breakpoint
CREATE INDEX "document_events_doc" ON "document_events" USING btree ("doc_type","doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_requests_number_uq" ON "invoice_requests" USING btree ("jv_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("jv_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_external_uq" ON "invoices" USING btree ("jv_id","source_system","external_number") WHERE "invoices"."kind" = 'external';--> statement-breakpoint
CREATE UNIQUE INDEX "jvs_code_uq" ON "jvs" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "jvs_short_code_uq" ON "jvs" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "ledger_jv_currency_date" ON "ledger_entries" USING btree ("jv_id","currency","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_source" ON "ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_single_reversal_uq" ON "ledger_entries" USING btree ("reverses_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_uq" ON "memberships" USING btree ("user_id","jv_id","role");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_jv_name_uq" ON "projects" USING btree ("jv_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_uq" ON "receipts" USING btree ("jv_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "requisitions_number_uq" ON "requisitions" USING btree ("jv_id","number");--> statement-breakpoint
CREATE INDEX "requisitions_jv_status" ON "requisitions" USING btree ("jv_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoices_uq" ON "supplier_invoices" USING btree ("jv_id",lower("supplier"),"supplier_invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));