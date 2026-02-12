-- Run this file after schema.sql.
-- It inserts default admin/settings/sample campaign data.

insert into public.admins(email)
values ('49125466easongo@gmail.com')
on conflict (email) do nothing;

insert into public.app_settings(key, value)
values (
  'order_form_defaults',
  jsonb_build_object(
    'field_config',
    jsonb_build_array(
      jsonb_build_object('key', 'customer_name', 'label', '姓名', 'type', 'text', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'phone', 'label', '手機', 'type', 'tel', 'required', true, 'visible', true, 'placeholder', '例如 0912345678', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'email', 'label', 'Email', 'type', 'email', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'quantity', 'label', '數量', 'type', 'number', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transfer_account', 'label', '匯款帳號', 'type', 'text', 'required', true, 'visible', true, 'placeholder', '例如 12345 或 完整帳號', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transfer_time', 'label', '匯款時間', 'type', 'datetime-local', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transaction_method', 'label', '交易方式', 'type', 'select', 'required', true, 'visible', true, 'placeholder', '', 'options', jsonb_build_array('面交', '賣貨便'), 'source', 'fixed'),
      jsonb_build_object('key', 'note', 'label', '備註', 'type', 'textarea', 'required', false, 'visible', true, 'placeholder', '可留空', 'options', '[]'::jsonb, 'source', 'fixed')
    )
  )
)
on conflict (key) do nothing;

insert into public.app_settings(key, value)
values (
  'order_status_options',
  jsonb_build_object(
    'options',
    jsonb_build_array('已匯款', '已採購', '已到貨', '已完成')
  )
)
on conflict (key) do nothing;

insert into public.app_settings(key, value)
values (
  'order_filter_presets',
  jsonb_build_object('presets', '[]'::jsonb)
)
on conflict (key) do nothing;

insert into public.campaigns(slug, title, description, custom_fields, is_active)
values (
  'usj-poster-initial',
  '環球影城海報冊代購（第一梯）',
  '請填寫訂購資訊。' || E'\n\n' || '匯款後請保留明細，若選擇賣貨便請於備註提供寄件所需資訊。',
  '[]'::jsonb,
  true
)
on conflict (slug) do nothing;

update public.campaigns c
set field_config = coalesce(
  (
    select jsonb_agg(item order by ord)
    from (
      select df as item, ord
      from jsonb_array_elements(
        coalesce((select s.value->'field_config' from public.app_settings s where s.key = 'order_form_defaults'), '[]'::jsonb)
      ) with ordinality as t(df, ord)
      union all
      select jsonb_build_object(
        'key', cf->>'key',
        'label', coalesce(cf->>'label', cf->>'key'),
        'type', coalesce(cf->>'type', 'text'),
        'required', coalesce((cf->>'required')::boolean, false),
        'visible', true,
        'placeholder', '',
        'options', coalesce(cf->'options', '[]'::jsonb),
        'source', 'custom'
      ) as item,
      1000 + ord as ord
      from jsonb_array_elements(coalesce(c.custom_fields, '[]'::jsonb)) with ordinality as t(cf, ord)
      where coalesce(cf->>'key', '') <> ''
    ) merged
  ),
  '[]'::jsonb
)
where coalesce(jsonb_array_length(c.field_config), 0) = 0;
