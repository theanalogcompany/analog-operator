import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

const OperatorSchema = z
  .object({
    id: z.string().uuid(),
    phone_number: z.string().nullable(),
    email: z.string().email().nullable(),
    auth_user_id: z.string().uuid().nullable(),
  })
  .passthrough();

export type Operator = z.infer<typeof OperatorSchema>;

export type LinkOperatorResult =
  | { ok: true; operator: Operator }
  | { ok: false; error: 'not_provisioned' | 'rpc_failed' | 'invalid_response' };

export async function linkOperator(args: {
  phone?: string;
  email?: string;
}): Promise<LinkOperatorResult> {
  const { data, error } = await supabase
    .rpc('link_operator_auth', {
      p_phone: args.phone ?? null,
      p_email: args.email ?? null,
    })
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'rpc_failed' };
  }
  if (data === null) {
    return { ok: false, error: 'not_provisioned' };
  }

  const parsed = OperatorSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_response' };
  }
  return { ok: true, operator: parsed.data };
}
