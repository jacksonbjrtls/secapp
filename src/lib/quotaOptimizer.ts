/**
 * Quota & Cost Optimizer for Cloud Firestore.
 * Reduces billing by:
 * 1. Setting role-aware document query limits (viewer/manager get strict fast limits, admin/master get extended limits)
 * 2. Caching reads locally with configurable TTLs to avoid repeated requests to the server
 * 3. Replacing continuous listeners with on-demand refresh triggers
 */

export function isPrivilegedRole(role?: string, isMaster?: boolean): boolean {
  if (isMaster) return true;
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return normalized === 'admin' || normalized === 'master' || normalized === 'administrador';
}

/**
 * Returns a strict query limit for viewers/managers/operators to prevent runaway Firestore read costs,
 * while allowing higher or full limits for administrators and masters.
 */
export function getRoleBasedLimit(
  role: string | undefined, 
  isMaster: boolean | undefined, 
  viewerLimit: number = 25, 
  adminLimit: number = 150
): number {
  return isPrivilegedRole(role, isMaster) ? adminLimit : viewerLimit;
}

/**
 * Format timestamp into relative/human readable time in Portuguese.
 */
export function formatLastUpdatedText(date: Date | null): string {
  if (!date) return 'Nunca sincronizado';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 45) return 'Atualizado agora mesmo';
  if (diffMin === 1) return 'Atualizado há 1 minuto';
  if (diffMin < 60) return `Atualizado há ${diffMin} minutos`;
  
  return `Atualizado às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
