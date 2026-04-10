/**
 * Feature-level permissions for workspace members.
 * The owner can customize these per user, overriding the role defaults.
 */

export interface UserPermissions {
  brain: boolean;
  import: boolean;
  sources: boolean;
  explorer: boolean;
  apps: boolean;
  chat: boolean;
}

/**
 * Full self-contained license stored in OrgMember.permissions (Json field).
 * When present, this takes full precedence over role defaults.
 * version: schema version (currently 1)
 * grantedAt: ISO 8601 timestamp of when the license was issued
 */
export interface License extends UserPermissions {
  version: number;
  grantedAt: string;
}

export interface PermissionMeta {
  key: keyof UserPermissions;
  label: string;
  description: string;
  group: string;
}

export const PERMISSION_META: PermissionMeta[] = [
  { key: "sources",  label: "Data Sources",  description: "View connected data sources",      group: "Data" },
  { key: "import",   label: "Import Data",   description: "Upload and import CSV/Excel files", group: "Data" },
  { key: "explorer", label: "Explorer",      description: "Browse and query imported data",    group: "Data" },
  { key: "brain",    label: "Brain / Rules", description: "Create and manage operational rules", group: "Intelligence" },
  { key: "apps",     label: "App Gallery",   description: "Access installed apps",             group: "Apps" },
  { key: "chat",     label: "Data Chat",     description: "Chat with AI about operational data", group: "Apps" },
];

/** Role-based defaults — used when no license is stored. */
export const ROLE_DEFAULTS: Record<string, UserPermissions> = {
  OWNER:  { brain: true,  import: true,  sources: true, explorer: true, apps: true, chat: true },
  ADMIN:  { brain: true,  import: true,  sources: true, explorer: true, apps: true, chat: true },
  MEMBER: { brain: true,  import: true,  sources: true, explorer: true, apps: true, chat: true },
  VIEWER: { brain: false, import: false, sources: true, explorer: true, apps: true, chat: true },
};

/**
 * Create a default License for a given role.
 * Used when saving a new full license for a member.
 */
export function createLicense(role: string): License {
  const defaults = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.VIEWER;
  return {
    version: 1,
    grantedAt: new Date().toISOString(),
    ...defaults,
  };
}

/**
 * Resolve the effective permissions for a member.
 *
 * Supports two stored formats in OrgMember.permissions:
 *   - New (v1): full License object with `version` field — used as-is
 *   - Legacy: partial overrides (no `version`) — merged over role defaults
 * Falls back to role defaults when nothing is stored.
 */
export function resolvePermissions(
  role: string,
  custom: Record<string, unknown> | null | undefined
): UserPermissions {
  const defaults = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.VIEWER;
  if (!custom || typeof custom !== "object") return defaults;

  // New format: full license with version field — use directly
  if (typeof custom.version === "number") {
    return {
      brain:    typeof custom.brain    === "boolean" ? custom.brain    : defaults.brain,
      import:   typeof custom.import   === "boolean" ? custom.import   : defaults.import,
      sources:  typeof custom.sources  === "boolean" ? custom.sources  : defaults.sources,
      explorer: typeof custom.explorer === "boolean" ? custom.explorer : defaults.explorer,
      apps:     typeof custom.apps     === "boolean" ? custom.apps     : defaults.apps,
      chat:     typeof custom.chat     === "boolean" ? custom.chat     : defaults.chat,
    };
  }

  // Legacy format: partial overrides — merge over defaults
  return {
    brain:    typeof custom.brain    === "boolean" ? custom.brain    : defaults.brain,
    import:   typeof custom.import   === "boolean" ? custom.import   : defaults.import,
    sources:  typeof custom.sources  === "boolean" ? custom.sources  : defaults.sources,
    explorer: typeof custom.explorer === "boolean" ? custom.explorer : defaults.explorer,
    apps:     typeof custom.apps     === "boolean" ? custom.apps     : defaults.apps,
    chat:     typeof custom.chat     === "boolean" ? custom.chat     : defaults.chat,
  };
}
