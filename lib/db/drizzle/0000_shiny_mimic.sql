CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"image_url" text NOT NULL,
	"trimmed_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pliegos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"tipo_papel" text,
	"width_cm" real DEFAULT 58 NOT NULL,
	"height_cm" real DEFAULT 100 NOT NULL,
	"dpi" integer DEFAULT 300 NOT NULL,
	"price_per_meter" real DEFAULT 3500 NOT NULL,
	"thumbnail_data_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pliego_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"pliego_id" integer NOT NULL,
	"upload_id" integer NOT NULL,
	"x_cm" real DEFAULT 0 NOT NULL,
	"y_cm" real DEFAULT 0 NOT NULL,
	"width_cm" real NOT NULL,
	"height_cm" real NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"email" text,
	"display_name" text,
	"avatar_url" text,
	"google_id" text,
	"facebook_id" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" text,
	"email_verification_expiry" timestamp with time zone,
	"plan" text DEFAULT 'client' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id")
);
--> statement-breakpoint
CREATE TABLE "yuki_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"price_type" text DEFAULT 'normal' NOT NULL,
	"custom_price_per_meter" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"reason" text,
	"sale_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"description" text,
	"stock" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'metros' NOT NULL,
	"cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"low_stock_alert" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_price_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_meters" numeric(10, 2) NOT NULL,
	"max_meters" numeric(10, 2),
	"price_per_meter" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"total_meters" numeric(10, 2) NOT NULL,
	"price_per_meter" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"payment_method" text DEFAULT 'efectivo' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_sales_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "business_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" text DEFAULT 'DTF Pliego' NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"rfc" text,
	"ticket_header" text,
	"ticket_footer" text,
	"logo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pliegos" ADD CONSTRAINT "pliegos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pliego_images" ADD CONSTRAINT "pliego_images_pliego_id_pliegos_id_fk" FOREIGN KEY ("pliego_id") REFERENCES "public"."pliegos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pliego_images" ADD CONSTRAINT "pliego_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_inventory_movements" ADD CONSTRAINT "pos_inventory_movements_inventory_id_pos_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."pos_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_inventory_movements" ADD CONSTRAINT "pos_inventory_movements_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_customer_id_pos_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."pos_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;