import axios from 'axios';

interface ApiConfig {
  env: 'production' | 'sandbox';
  username: string;
  password: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface RecepcionPayload {
  clave: string;
  fecha: string;
  emisor: { tipoIdentificacion: string; numeroIdentificacion: string };
  receptor?: { tipoIdentificacion: string; numeroIdentificacion: string };
  comprobanteXml: string;
  callbackUrl?: string;
}

interface StatusResponse {
  clave: string;
  fecha: string;
  'ind-estado': 'recibido' | 'procesando' | 'aceptado' | 'rechazado' | 'error';
  'respuesta-xml'?: string;
  mensaje?: string;
}

interface IdentificacionComprobante {
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  nombre?: string;
}

interface ComprobanteItem {
  clave: string;
  fecha: string;
}

export interface ComprobanteResponse {
  clave: string;
  fecha: string;
  emisor: IdentificacionComprobante;
  receptor: IdentificacionComprobante;
  notasCredito?: ComprobanteItem[];
  notasDebito?: ComprobanteItem[];
}

export interface ConsultaParams {
  emisor?: string;
  receptor?: string;
  offset?: number;
  limit?: number;
}

const ENDPOINTS = {
  production: {
    token: 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token',
    api: 'https://api.comprobanteselectronicos.go.cr/recepcion/v1',
    clientId: 'api-prod',
  },
  sandbox: {
    token: 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token',
    api: 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1',
    clientId: 'api-stag',
  },
};

export async function obtenerToken(config: ApiConfig): Promise<string> {
  const ep = ENDPOINTS[config.env];
  // username formato: cpf-01-0000-0000@stag.comprobanteselectronicos.go.cr (sandbox)
  //                   cpf-01-0000-0000@comprobanteselectronicos.go.cr        (producción)
  //                   cpj-3-101-000000@...  para persona jurídica
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: ep.clientId,
    username: config.username,
    password: config.password,
  });

  const response = await axios.post<TokenResponse>(ep.token, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

export async function enviarFactura(
  token: string,
  env: 'production' | 'sandbox',
  payload: RecepcionPayload,
): Promise<void> {
  const ep = ENDPOINTS[env];
  await axios.post(`${ep.api}/recepcion`, payload, {
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  // 201 Created = recibido para procesamiento
}

export async function consultarEstado(
  token: string,
  env: 'production' | 'sandbox',
  clave: string,
): Promise<StatusResponse> {
  const ep = ENDPOINTS[env];
  const response = await axios.get<StatusResponse>(`${ep.api}/recepcion/${clave}`, {
    headers: { Authorization: `bearer ${token}` },
  });
  return response.data;
}

/**
 * Envía la factura y espera hasta obtener estado final (aceptado/rechazado).
 * Polling cada 5 segundos, máximo 2 minutos.
 */
export async function enviarYEsperar(
  config: ApiConfig,
  payload: RecepcionPayload,
  onStatus: (status: string) => void,
): Promise<StatusResponse> {
  const token = await obtenerToken(config);
  onStatus('Token obtenido. Enviando factura...');

  await enviarFactura(token, config.env, payload);
  onStatus('Factura recibida por Hacienda (HTTP 201). Esperando validación...');

  const MAX_INTENTOS = 24; // 24 × 5s = 2 min
  const DELAY_MS = 5000;

  for (let i = 0; i < MAX_INTENTOS; i++) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    const estado = await consultarEstado(token, config.env, payload.clave);
    onStatus(`Estado [${i + 1}/${MAX_INTENTOS}]: ${estado['ind-estado']}`);

    if (estado['ind-estado'] === 'aceptado' || estado['ind-estado'] === 'rechazado' || estado['ind-estado'] === 'error') {
      return estado;
    }
  }

  throw new Error('Timeout: Hacienda no respondió en 2 minutos. Consulta manualmente la clave en Tribu-CR.');
}

export interface PaginatedComprobantes {
  items: ComprobanteResponse[];
  /** Total en sistema (NO es el total filtrado — es contador global de Hacienda) */
  systemTotal?: number;
  offset: number;
  limit: number;
  /** true si puede haber más items (items.length === limit) */
  hasMore: boolean;
}

export async function consultarComprobante(
  token: string,
  env: 'production' | 'sandbox',
  clave: string,
): Promise<ComprobanteResponse> {
  const ep = ENDPOINTS[env];
  const response = await axios.get<ComprobanteResponse>(`${ep.api}/comprobantes/${clave}`, {
    headers: { Authorization: `bearer ${token}` },
  });
  return response.data;
}

export async function consultarComprobantes(
  token: string,
  env: 'production' | 'sandbox',
  params: ConsultaParams = {},
): Promise<PaginatedComprobantes> {
  const ep = ENDPOINTS[env];
  const query = new URLSearchParams();
  if (params.emisor)  query.set('emisor', params.emisor);
  if (params.receptor) query.set('receptor', params.receptor);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit   !== undefined) query.set('limit', String(params.limit));

  const url = `${ep.api}/comprobantes${query.toString() ? '?' + query.toString() : ''}`;
  const response = await axios.get<ComprobanteResponse[]>(url, {
    headers: { Authorization: `bearer ${token}` },
  });

  const contentRange = response.headers['content-range'] as string | undefined;
  let systemTotal: number | undefined;
  if (contentRange) {
    // Formato Hacienda: "{offset}-{limitParam}/{systemTotal}"
    // El número del medio es el limit enviado, NO el end index.
    const match = contentRange.match(/\d+-\d+\/(\d+)/);
    if (match) systemTotal = parseInt(match[1], 10);
  }

  const effectiveLimit = params.limit ?? 5;

  return {
    items: response.data,
    systemTotal,
    offset: params.offset ?? 0,
    limit: effectiveLimit,
    // Hay más items solo si llenamos exactamente el page size pedido
    hasMore: response.data.length === effectiveLimit,
  };
}

export type { ApiConfig, RecepcionPayload, StatusResponse };
