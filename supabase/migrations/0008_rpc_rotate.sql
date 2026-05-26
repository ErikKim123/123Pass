-- 0008_rpc_rotate.sql
-- Design Ref: §4.3 — atomic master password rotation.
-- Client re-encrypts every vault item locally under the new vaultKey, then calls this RPC to
-- swap kdf_params + encrypted_private_key + every ciphertext in ONE transaction.

create or replace function public.rotate_master_password(
  new_kdf_params         jsonb,
  new_encrypted_private_key jsonb,
  new_items              jsonb   -- array of { id, ciphertext, iv, authTag, version }
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  item      jsonb;
  affected  integer;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Sanity check the kdf_params shape.
  if not (new_kdf_params ? 'algorithm'
       and new_kdf_params ? 'memoryCost'
       and new_kdf_params ? 'timeCost'
       and new_kdf_params ? 'parallelism'
       and new_kdf_params ? 'saltAuth'
       and new_kdf_params ? 'saltVault') then
    raise exception 'KDF_PARAMS_INVALID' using errcode = '22023';
  end if;

  update public.users
     set kdf_params            = new_kdf_params,
         encrypted_private_key = new_encrypted_private_key
   where id = caller_id;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Apply every re-encrypted item. Each row must already belong to caller (RLS would block otherwise,
  -- but we double-check via WHERE).
  for item in select * from jsonb_array_elements(new_items)
  loop
    update public.encrypted_vault_items
       set ciphertext = item->>'ciphertext',
           iv         = item->>'iv',
           auth_tag   = item->>'authTag',
           version    = coalesce((item->>'version')::bigint, version + 1)
     where id      = (item->>'id')::uuid
       and user_id = caller_id;
    get diagnostics affected = row_count;
    if affected = 0 then
      raise exception 'ITEM_NOT_FOUND id=%', item->>'id' using errcode = 'P0002';
    end if;
  end loop;

  -- Audit
  insert into public.audit_events (user_id, event_type, metadata)
  values (caller_id, 'master_pw_changed',
          jsonb_build_object('itemCount', jsonb_array_length(new_items)));
end;
$$;

revoke all on function public.rotate_master_password(jsonb, jsonb, jsonb) from public;
grant execute on function public.rotate_master_password(jsonb, jsonb, jsonb) to authenticated;
