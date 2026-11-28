CREATE TABLE "participant_memory_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_access_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "participant_memory_access_purpose_check" CHECK ("participant_memory_access"."purpose" in ('access','delete','session')),
	CONSTRAINT "participant_memory_access_hash_check" CHECK ("participant_memory_access"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "participant_memory_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"wording_version" text NOT NULL,
	"wording_hash" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "participant_memory_consent_revoked_check" CHECK (("participant_memory_consent"."revoked_at" is null and "participant_memory_consent"."revoked_reason" is null) or ("participant_memory_consent"."revoked_at" is not null and "participant_memory_consent"."revoked_reason" in ('withdrawn','deleted','disabled','expired')))
);
--> statement-breakpoint
CREATE TABLE "participant_memory_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"type_key" text NOT NULL,
	"type_name" text NOT NULL,
	"object_id" uuid NOT NULL,
	"valid_until" date NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_document_unique" UNIQUE("organization_id","email","type_key","object_id")
);
--> statement-breakpoint
CREATE TABLE "participant_memory_passenger" (
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"passenger_email" text,
	"date_of_birth" date,
	"country" text,
	"phone" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_passenger_organization_id_email_pk" PRIMARY KEY("organization_id","email")
);
--> statement-breakpoint
CREATE TABLE "participant_memory_profile" (
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" date,
	"country" text,
	"phone" text,
	"street" text,
	"postal_code" text,
	"city" text,
	"blood_group" text,
	"license_number" text,
	"license_valid_until" date,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"source_event_name" text NOT NULL,
	"source_event_starts_on" date NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_profile_organization_id_email_pk" PRIMARY KEY("organization_id","email")
);
--> statement-breakpoint
CREATE TABLE "participant_memory_setting" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"retention_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_issuer" text,
	"updated_by_subject" text,
	CONSTRAINT "participant_memory_setting_retention_check" CHECK ("participant_memory_setting"."retention_days" is null or "participant_memory_setting"."retention_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "participant_memory_vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"fingerprint" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"registration" text,
	"vin" text,
	"vehicle_type" text,
	"displacement_cc" integer,
	"cylinders" integer,
	"transponder_number" text,
	"vehicle_pass_number" text,
	"owner_name" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_vehicle_unique" UNIQUE("organization_id","email","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_template_key_check";--> statement-breakpoint
ALTER TABLE "email_template_version" DROP CONSTRAINT "email_template_version_key_check";--> statement-breakpoint
ALTER TABLE "participant_memory_access" ADD CONSTRAINT "participant_memory_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_consent" ADD CONSTRAINT "participant_memory_consent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_document" ADD CONSTRAINT "participant_memory_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_passenger" ADD CONSTRAINT "participant_memory_passenger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_profile" ADD CONSTRAINT "participant_memory_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_setting" ADD CONSTRAINT "participant_memory_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_vehicle" ADD CONSTRAINT "participant_memory_vehicle_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_memory_access_org_email_idx" ON "participant_memory_access" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "participant_memory_access_expires_idx" ON "participant_memory_access" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_memory_consent_active_unique" ON "participant_memory_consent" USING btree ("organization_id","email") WHERE "participant_memory_consent"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "participant_memory_consent_org_email_idx" ON "participant_memory_consent" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "participant_memory_document_captured_idx" ON "participant_memory_document" USING btree ("organization_id","captured_at");--> statement-breakpoint
CREATE INDEX "participant_memory_passenger_captured_idx" ON "participant_memory_passenger" USING btree ("organization_id","captured_at");--> statement-breakpoint
CREATE INDEX "participant_memory_profile_captured_idx" ON "participant_memory_profile" USING btree ("organization_id","captured_at");--> statement-breakpoint
CREATE INDEX "participant_memory_vehicle_captured_idx" ON "participant_memory_vehicle" USING btree ("organization_id","captured_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_template_key_check" CHECK ("email_outbox"."template_key" in ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received','team-invitation','participant-memory-link','participant-memory-delete'));--> statement-breakpoint
ALTER TABLE "email_template_version" ADD CONSTRAINT "email_template_version_key_check" CHECK ("email_template_version"."template_key" in ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received','team-invitation','participant-memory-link','participant-memory-delete'));