import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { anonClient, decodeJwt, serviceClient } from './clients.ts';
import { HttpError, type RequestContext } from './http.ts';
import { MFA_STEPUP_MIN } from './portalConfig.ts';

export interface RequireUserOptions {
  admin?: boolean;
  aal2?: boolean;
  stepUp?: boolean;
  allowPendingPassword?: boolean;
  /** Exige AAL2 apenas se o usuário já tiver um fator TOTP verificado. */
  aal2IfEnrolled?: boolean;
}

export interface PortalProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  active: boolean;
  must_change_password: boolean;
}

export interface AuthContext {
  user: User;
  profile: PortalProfile;
  isAdmin: boolean;
  aal: string;
  sessionId: string | null;
  token: string;
  hasVerifiedFactor: boolean;
  amr: { method: string; timestamp: number }[];
  svc: SupabaseClient;
}

export function assertStepUp(auth: Pick<AuthContext, 'amr'>) {
  const lastTotp = auth.amr
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp)
    .sort((a, b) => b - a)[0];
  if (!lastTotp || Date.now() - lastTotp * 1000 > MFA_STEPUP_MIN * 60_000) {
    throw new HttpError(403, 'STEP_UP_REQUIRED', 'Confirme com o código do seu aplicativo para continuar.');
  }
}

export async function requireUser(ctx: RequestContext, options: RequireUserOptions = {}): Promise<AuthContext> {
  const header = ctx.req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não autenticada. Faça login novamente.');

  const userClient = anonClient(token);
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão expirada. Faça login novamente.');
  const user = data.user;
  const claims = decodeJwt(token);
  const aal = claims.aal ?? 'aal1';
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const hasVerifiedFactor = (user.factors ?? []).some((f) => f.status === 'verified' && f.factor_type === 'totp');

  const { data: profile } = await userClient
    .from('pp_profiles')
    .select('id, username, email, name, active, must_change_password')
    .eq('id', user.id)
    .maybeSingle<PortalProfile>();
  if (!profile) throw new HttpError(403, 'FORBIDDEN', 'Acesso não autorizado.');
  if (!profile.active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'Esta conta está desativada. Procure o administrador.');
  if (profile.must_change_password && !options.allowPendingPassword) {
    throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Troque a senha temporária para continuar.');
  }

  const { data: isAdmin } = await userClient.rpc('pp_has_role', { _user_id: user.id, _role: 'admin' });
  if (options.admin && !isAdmin) throw new HttpError(403, 'FORBIDDEN', 'Apenas administradores podem executar esta ação.');

  const needsAal2 = options.admin || options.aal2 || options.stepUp || (options.aal2IfEnrolled && hasVerifiedFactor);
  if (needsAal2 && aal !== 'aal2') {
    throw new HttpError(403, 'AAL2_REQUIRED', 'Confirme o acesso com o código do aplicativo autenticador.');
  }
  if (options.stepUp) assertStepUp({ amr });

  return {
    user,
    profile,
    isAdmin: Boolean(isAdmin),
    aal,
    sessionId: claims.session_id ?? null,
    token,
    hasVerifiedFactor,
    amr,
    svc: serviceClient(),
  };
}
