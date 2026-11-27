CREATE TABLE "participant_memory_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action" text NOT NULL,
	"email_hash" text NOT NULL,
	"actor_issuer" text NOT NULL,
	"actor_subject" text NOT NULL,
	"removed_rows" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_audit_action_check" CHECK ("participant_memory_audit"."action" in ('erased'))
);
--> statement-breakpoint
CREATE TABLE "participant_memory_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_memory_request_unique" UNIQUE("organization_id","email","purpose"),
	CONSTRAINT "participant_memory_request_purpose_check" CHECK ("participant_memory_request"."purpose" in ('access','delete')),
	CONSTRAINT "participant_memory_request_locale_check" CHECK ("participant_memory_request"."locale" in ('de','en'))
);
--> statement-breakpoint
ALTER TABLE "participant_memory_consent" DROP CONSTRAINT "participant_memory_consent_revoked_check";--> statement-breakpoint
ALTER TABLE "participant_memory_consent" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_memory_consent" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "participant_memory_audit" ADD CONSTRAINT "participant_memory_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_memory_request" ADD CONSTRAINT "participant_memory_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_memory_audit_org_idx" ON "participant_memory_audit" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "participant_memory_request_created_idx" ON "participant_memory_request" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "participant_memory_consent_hash_idx" ON "participant_memory_consent" USING btree ("organization_id","email_hash");--> statement-breakpoint
ALTER TABLE "participant_memory_passenger" DROP COLUMN "date_of_birth";--> statement-breakpoint
ALTER TABLE "participant_memory_passenger" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "participant_memory_passenger" DROP COLUMN "phone";--> statement-breakpoint
-- The feature (0054) was never released. Data captured under the old rules may belong to people who never consented
-- (shared contact address), consent rows keep cleartext addresses that cannot be hashed in SQL (the key is not in the
-- database), and the consent wording changed, so every earlier consent is void anyway. Start clean.
DELETE FROM "participant_memory_document";--> statement-breakpoint
DELETE FROM "participant_memory_passenger";--> statement-breakpoint
DELETE FROM "participant_memory_vehicle";--> statement-breakpoint
DELETE FROM "participant_memory_profile";--> statement-breakpoint
DELETE FROM "participant_memory_consent";--> statement-breakpoint
ALTER TABLE "participant_memory_consent" ADD CONSTRAINT "participant_memory_consent_address_check" CHECK (("participant_memory_consent"."revoked_at" is null and "participant_memory_consent"."email" is not null) or ("participant_memory_consent"."revoked_at" is not null and "participant_memory_consent"."email" is null));--> statement-breakpoint
ALTER TABLE "participant_memory_consent" ADD CONSTRAINT "participant_memory_consent_revoked_check" CHECK (("participant_memory_consent"."revoked_at" is null and "participant_memory_consent"."revoked_reason" is null) or ("participant_memory_consent"."revoked_at" is not null and "participant_memory_consent"."revoked_reason" in ('withdrawn','deleted','disabled','expired','superseded','erased')));