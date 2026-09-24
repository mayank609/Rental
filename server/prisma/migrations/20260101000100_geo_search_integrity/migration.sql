-- =============================================================================
-- Custom SQL that Prisma cannot express natively:
--  1. PostGIS point maintenance from the public (approximate) coordinates
--  2. Weighted full-text search vector
--  3. Exclusion constraint that makes double bookings impossible at DB level
--  4. Sanity CHECK constraints
-- =============================================================================

-- 1 + 2: keep geo point & search vector in sync with row data -----------------
CREATE OR REPLACE FUNCTION listing_derived_columns() RETURNS trigger AS $$
BEGIN
  -- Geo queries use the *approximate* point so distances can never be used
  -- to triangulate an owner's exact address.
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."approxLng", NEW."approxLat"), 4326)::geography;
  NEW."searchVector" :=
      setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(NEW."rules", '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listing_derived_columns_trg
BEFORE INSERT OR UPDATE OF "approxLat", "approxLng", "title", "description", "rules"
ON "Listing"
FOR EACH ROW EXECUTE FUNCTION listing_derived_columns();

CREATE INDEX IF NOT EXISTS "Listing_title_idx" ON "Listing" USING GIN ("title" gin_trgm_ops);

-- 3: no two blocking bookings may overlap for the same listing ----------------
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist (
    "listingId" WITH =,
    tstzrange("startAt" AT TIME ZONE 'UTC', "endAt" AT TIME ZONE 'UTC', '[)') WITH &&
  )
  WHERE ("status" IN ('ACCEPTED', 'CONFIRMED', 'ACTIVE', 'OVERDUE'));

-- 4: sanity checks ------------------------------------------------------------
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dates_chk" CHECK ("endAt" > "startAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_chk" CHECK ("totalAmount" >= 0 AND "rentAmount" >= 0);
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_dates_chk" CHECK ("endAt" > "startAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_chk" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_chk" CHECK ("priceDaily" IS NOT NULL OR "priceHourly" IS NOT NULL);
