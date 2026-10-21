-- INV-i (Fred 2026-10-21): the Product Type list grows from 4 options to 36 (see SPEC §9.1 INV-i and
-- src/registry/tables/products.ts). Stored values that changed name are moved; Amplifier and Speaker stay.
-- Stock and Sale carry read-only copies of the product's type, so they move too.
update public.products set product_type = 'Dimmer / Switch' where product_type = 'Dimmer';
update public.products set product_type = 'TV' where product_type = 'Television';
update public.stock_items set product_type = 'Dimmer / Switch' where product_type = 'Dimmer';
update public.stock_items set product_type = 'TV' where product_type = 'Television';
update public.sales set product_type = 'Dimmer / Switch' where product_type = 'Dimmer';
update public.sales set product_type = 'TV' where product_type = 'Television';
