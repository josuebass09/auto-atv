/**
 * Resolución de credenciales de Hacienda por ambiente.
 *
 * Prioriza variables prefijadas (HACIENDA_USERNAME_PRODUCTION / _SANDBOX) y
 * cae en las variables sin prefijo (HACIENDA_USERNAME / HACIENDA_PASSWORD)
 * para retrocompatibilidad.
 */
export function getCreds(env: 'production' | 'sandbox'): { username: string; password: string; certPassword: string } {
  const suffix = env.toUpperCase(); // PRODUCTION | SANDBOX
  const username     = process.env[`HACIENDA_USERNAME_${suffix}`]    ?? process.env['HACIENDA_USERNAME']    ?? '';
  const password     = process.env[`HACIENDA_PASSWORD_${suffix}`]    ?? process.env['HACIENDA_PASSWORD']    ?? '';
  const certPassword = process.env[`CERT_PASSWORD_${suffix}`]        ?? process.env['CERT_PASSWORD']        ?? '';
  return { username, password, certPassword };
}
