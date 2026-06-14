import { Router, type Request, type Response } from 'express'
import { getSupabase } from '../supabase.js'
import { getRequestUser } from '../utils/requestUser.js'

const router = Router()

const requireServiceRole = (): void => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Necessária para gerenciar usuários.'
    )
  }
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  can_access_dashboard?: boolean | null
  can_access_expense_dashboard?: boolean | null
  can_access_reports?: boolean | null
  can_access_programacao?: boolean | null
  can_access_financeiro?: boolean | null
  can_manage_users?: boolean | null
  can_manage_config?: boolean | null
  last_seen_at?: string | null
  created_at: string | null
  updated_at: string | null
}

type UserDto = {
  id: string
  email: string
  fullName: string | null
  role: string | null
  canAccessDashboard: boolean
  canAccessExpenseDashboard: boolean
  canAccessReports: boolean
  canAccessProgramacao: boolean
  canAccessFinanceiro: boolean
  canManageUsers: boolean
  canManageConfig: boolean
  createdAt: string | null
  lastSignInAt: string | null
  lastSeenAt: string | null
  emailConfirmed: boolean
}

type PermissionKey =
  | 'can_access_dashboard'
  | 'can_access_expense_dashboard'
  | 'can_access_reports'
  | 'can_access_programacao'
  | 'can_access_financeiro'
  | 'can_manage_users'
  | 'can_manage_config'

const hasAccess = (profile: ProfileRow | undefined, key: PermissionKey): boolean => {
  if (typeof profile?.[key] === 'boolean') return Boolean(profile[key])
  return (profile?.role ?? '').toLowerCase() === 'admin'
}

const dtoPermissions = (profile: ProfileRow | undefined) => ({
  canAccessDashboard: hasAccess(profile, 'can_access_dashboard'),
  canAccessExpenseDashboard: hasAccess(profile, 'can_access_expense_dashboard'),
  canAccessReports: hasAccess(profile, 'can_access_reports'),
  canAccessProgramacao: hasAccess(profile, 'can_access_programacao'),
  canAccessFinanceiro: hasAccess(profile, 'can_access_financeiro'),
  canManageUsers: hasAccess(profile, 'can_manage_users'),
  canManageConfig: hasAccess(profile, 'can_manage_config'),
})

const fetchProfilesMap = async (): Promise<Map<string, ProfileRow>> => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
  if (error) throw error
  const map = new Map<string, ProfileRow>()
  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row)
  }
  return map
}

const fetchProfile = async (id: string): Promise<ProfileRow | null> => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as ProfileRow | null) ?? null
}

const upsertProfile = async (
  id: string,
  email: string | null,
  fullName: string | null,
  role: string | null,
  canAccessDashboard?: boolean,
  canAccessExpenseDashboard?: boolean,
  canAccessReports?: boolean,
  canAccessProgramacao?: boolean,
  canAccessFinanceiro?: boolean,
  canManageUsers?: boolean,
  canManageConfig?: boolean
): Promise<void> => {
  const supabase = getSupabase()
  const payload: Record<string, unknown> = {
    id,
    email,
    full_name: fullName,
    role,
    updated_at: new Date().toISOString(),
  }
  if (typeof canAccessDashboard === 'boolean') payload.can_access_dashboard = canAccessDashboard
  if (typeof canAccessExpenseDashboard === 'boolean') {
    payload.can_access_expense_dashboard = canAccessExpenseDashboard
  }
  if (typeof canAccessReports === 'boolean') payload.can_access_reports = canAccessReports
  if (typeof canAccessProgramacao === 'boolean') {
    payload.can_access_programacao = canAccessProgramacao
  }
  if (typeof canAccessFinanceiro === 'boolean') payload.can_access_financeiro = canAccessFinanceiro
  if (typeof canManageUsers === 'boolean') payload.can_manage_users = canManageUsers
  if (typeof canManageConfig === 'boolean') payload.can_manage_config = canManageConfig

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

/**
 * GET /api/users
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    requireServiceRole()
    const supabase = getSupabase()

    const [{ data: authData, error: authError }, profiles] = await Promise.all([
      supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
      fetchProfilesMap(),
    ])
    if (authError) throw authError

    const users: UserDto[] = (authData?.users ?? []).map((u) => {
      const p = profiles.get(u.id)
      return {
        id: u.id,
        email: u.email ?? p?.email ?? '',
        fullName: p?.full_name ?? null,
        role: p?.role ?? null,
        ...dtoPermissions(p),
        createdAt: u.created_at ?? p?.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        lastSeenAt: p?.last_seen_at ?? u.last_sign_in_at ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
      }
    })

    res.json({ success: true, users })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar usuários',
    })
  }
})

/**
 * POST /api/users/me/access
 * Registra o último acesso real do usuário autenticado no painel.
 */
router.post('/me/access', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Usuário não autenticado' })
      return
    }

    const now = new Date().toISOString()
    const { error } = await getSupabase()
      .from('profiles')
      .update({
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', user.id)

    if (error) throw error
    res.status(200).json({ success: true, lastSeenAt: now })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao registrar acesso',
    })
  }
})

/**
 * POST /api/users
 * body: { email, password, fullName?, role?, permissions... }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    requireServiceRole()
    const {
      email,
      password,
      fullName,
      role,
      canAccessDashboard,
      canAccessExpenseDashboard,
      canAccessReports,
      canAccessProgramacao,
      canAccessFinanceiro,
      canManageUsers,
      canManageConfig,
    } = (req.body ?? {}) as {
      email?: string
      password?: string
      fullName?: string
      role?: string
      canAccessDashboard?: boolean
      canAccessExpenseDashboard?: boolean
      canAccessReports?: boolean
      canAccessProgramacao?: boolean
      canAccessFinanceiro?: boolean
      canManageUsers?: boolean
      canManageConfig?: boolean
    }

    const trimmedEmail = (email ?? '').trim().toLowerCase()
    const trimmedFullName = fullName?.trim() || null
    const trimmedRole = role?.trim() || null

    if (!trimmedEmail || !password) {
      res
        .status(400)
        .json({ success: false, error: 'E-mail e senha são obrigatórios' })
      return
    }
    if (password.length < 6) {
      res
        .status(400)
        .json({ success: false, error: 'A senha precisa ter pelo menos 6 caracteres' })
      return
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: trimmedFullName ?? undefined,
        role: trimmedRole ?? undefined,
        can_access_dashboard: canAccessDashboard,
        can_access_expense_dashboard: canAccessExpenseDashboard,
        can_access_reports: canAccessReports,
        can_access_programacao: canAccessProgramacao,
        can_access_financeiro: canAccessFinanceiro,
        can_manage_users: canManageUsers,
        can_manage_config: canManageConfig,
      },
    })
    if (error) throw error

    const u = data.user
    if (!u) {
      res.status(500).json({ success: false, error: 'Usuário não retornado' })
      return
    }

    // Garante o profile mesmo que o trigger não tenha sido criado no Supabase.
    await upsertProfile(
      u.id,
      u.email ?? trimmedEmail,
      trimmedFullName,
      trimmedRole,
      Boolean(canAccessDashboard),
      Boolean(canAccessExpenseDashboard),
      Boolean(canAccessReports),
      Boolean(canAccessProgramacao),
      Boolean(canAccessFinanceiro),
      Boolean(canManageUsers),
      Boolean(canManageConfig)
    )
    const profile = await fetchProfile(u.id)

    res.status(201).json({
      success: true,
      user: {
        id: u.id,
        email: u.email ?? trimmedEmail,
        fullName: profile?.full_name ?? trimmedFullName,
        role: profile?.role ?? trimmedRole,
        ...dtoPermissions(profile ?? undefined),
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        lastSeenAt: profile?.last_seen_at ?? u.last_sign_in_at ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
      } satisfies UserDto,
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao criar usuário',
    })
  }
})

/**
 * PATCH /api/users/:id
 * body: { fullName?, role?, password?, permissions... }
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    requireServiceRole()
    const id = req.params.id
    if (!id) {
      res.status(400).json({ success: false, error: 'ID é obrigatório' })
      return
    }

    const {
      fullName,
      role,
      password,
      canAccessDashboard,
      canAccessExpenseDashboard,
      canAccessReports,
      canAccessProgramacao,
      canAccessFinanceiro,
      canManageUsers,
      canManageConfig,
    } = (req.body ?? {}) as {
      fullName?: string
      role?: string
      password?: string
      canAccessDashboard?: boolean
      canAccessExpenseDashboard?: boolean
      canAccessReports?: boolean
      canAccessProgramacao?: boolean
      canAccessFinanceiro?: boolean
      canManageUsers?: boolean
      canManageConfig?: boolean
    }

    const supabase = getSupabase()

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          error: 'A senha precisa ter pelo menos 6 caracteres',
        })
        return
      }
      const { error } = await supabase.auth.admin.updateUserById(id, {
        password,
      })
      if (error) throw error
    }

    if (
      typeof fullName === 'string' ||
      typeof role === 'string' ||
      typeof canAccessDashboard === 'boolean' ||
      typeof canAccessExpenseDashboard === 'boolean' ||
      typeof canAccessReports === 'boolean' ||
      typeof canAccessProgramacao === 'boolean' ||
      typeof canAccessFinanceiro === 'boolean' ||
      typeof canManageUsers === 'boolean' ||
      typeof canManageConfig === 'boolean'
    ) {
      const existing = await fetchProfile(id)
      const nextFullName =
        typeof fullName === 'string' ? fullName.trim() || null : existing?.full_name ?? null
      const nextRole =
        typeof role === 'string' ? role.trim() || null : existing?.role ?? null
      const nextCanAccessDashboard =
        typeof canAccessDashboard === 'boolean'
          ? canAccessDashboard
          : hasAccess(existing ?? undefined, 'can_access_dashboard')
      const nextCanAccessExpenseDashboard =
        typeof canAccessExpenseDashboard === 'boolean'
          ? canAccessExpenseDashboard
          : hasAccess(existing ?? undefined, 'can_access_expense_dashboard')
      const nextCanAccessReports =
        typeof canAccessReports === 'boolean'
          ? canAccessReports
          : hasAccess(existing ?? undefined, 'can_access_reports')
      const nextCanAccessProgramacao =
        typeof canAccessProgramacao === 'boolean'
          ? canAccessProgramacao
          : hasAccess(existing ?? undefined, 'can_access_programacao')
      const nextCanAccessFinanceiro =
        typeof canAccessFinanceiro === 'boolean'
          ? canAccessFinanceiro
          : hasAccess(existing ?? undefined, 'can_access_financeiro')
      const nextCanManageUsers =
        typeof canManageUsers === 'boolean'
          ? canManageUsers
          : hasAccess(existing ?? undefined, 'can_manage_users')
      const nextCanManageConfig =
        typeof canManageConfig === 'boolean'
          ? canManageConfig
          : hasAccess(existing ?? undefined, 'can_manage_config')

      await upsertProfile(
        id,
        existing?.email ?? null,
        nextFullName,
        nextRole,
        nextCanAccessDashboard,
        nextCanAccessExpenseDashboard,
        nextCanAccessReports,
        nextCanAccessProgramacao,
        nextCanAccessFinanceiro,
        nextCanManageUsers,
        nextCanManageConfig
      )

      // Mantém metadata em sincronia com a tabela
      await supabase.auth.admin.updateUserById(id, {
        user_metadata: {
          full_name: nextFullName ?? undefined,
          role: nextRole ?? undefined,
          can_access_dashboard: nextCanAccessDashboard,
          can_access_expense_dashboard: nextCanAccessExpenseDashboard,
          can_access_reports: nextCanAccessReports,
          can_access_programacao: nextCanAccessProgramacao,
          can_access_financeiro: nextCanAccessFinanceiro,
          can_manage_users: nextCanManageUsers,
          can_manage_config: nextCanManageConfig,
        },
      })
    }

    const profile = await fetchProfile(id)
    const { data: authUserResult } = await supabase.auth.admin.getUserById(id)
    const u = authUserResult?.user

    res.json({
      success: true,
      user: u
        ? ({
            id: u.id,
            email: u.email ?? profile?.email ?? '',
            fullName: profile?.full_name ?? null,
            role: profile?.role ?? null,
            ...dtoPermissions(profile ?? undefined),
            createdAt: u.created_at ?? null,
            lastSignInAt: u.last_sign_in_at ?? null,
            lastSeenAt: profile?.last_seen_at ?? u.last_sign_in_at ?? null,
            emailConfirmed: Boolean(u.email_confirmed_at),
          } satisfies UserDto)
        : null,
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao atualizar usuário',
    })
  }
})

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    requireServiceRole()
    const id = req.params.id
    if (!id) {
      res.status(400).json({ success: false, error: 'ID é obrigatório' })
      return
    }
    const supabase = getSupabase()
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) throw error
    // ON DELETE CASCADE no profiles cuida da limpeza.
    res.json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao excluir usuário',
    })
  }
})

export default router
