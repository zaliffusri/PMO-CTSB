alter table public.projects
add column if not exists engagement_type text;

comment on column public.projects.engagement_type is 'Contract instrument: contract, letter_of_offer, purchase_order, mou, quotation, tender, internal';
comment on column public.projects.classification is 'Legacy primary delivery scope when project has no work packages';
