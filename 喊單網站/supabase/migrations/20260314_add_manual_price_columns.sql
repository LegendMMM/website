-- Legacy data backfill for projects that still had hot/cold/average price columns.
-- Safe to skip on fresh installs that already use the current schema.

alter table public.products
  add column if not exists price integer not null default 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'average_price'
  ) THEN
    EXECUTE $update$
      update public.products
      set price = case
        when average_price > 0 then average_price
        when hot_price > 0 then hot_price
        when cold_price > 0 then cold_price
        else price
      end
      where price = 0
    $update$;
  END IF;
END $$;

alter table public.blind_box_items
  add column if not exists price integer;
