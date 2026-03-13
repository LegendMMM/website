alter table public.products
  add column if not exists price integer not null default 0;

update public.products
set price = case
  when average_price > 0 then average_price
  when hot_price > 0 then hot_price
  when cold_price > 0 then cold_price
  else 0
end
where price = 0;

alter table public.blind_box_items
  add column if not exists price integer;
