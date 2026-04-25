-- Add description and geo-location columns to delivery_locations
-- (referred to as "Delivery Points" in the UI).
alter table public.delivery_locations
  add column if not exists description text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Optional sanity check: latitude/longitude must either both be set or both null.
alter table public.delivery_locations
  drop constraint if exists delivery_locations_geo_chk;
alter table public.delivery_locations
  add constraint delivery_locations_geo_chk
  check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null
        and latitude  between -90  and 90
        and longitude between -180 and 180)
  );

comment on column public.delivery_locations.description is 'Human-readable description of the delivery point.';
comment on column public.delivery_locations.latitude   is 'Geo latitude in decimal degrees (WGS84).';
comment on column public.delivery_locations.longitude  is 'Geo longitude in decimal degrees (WGS84).';

