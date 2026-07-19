import axios from 'axios';

const GOMETA_URL = 'https://apis.gometa.org/tdc/tdc.json';

interface GometaResponse {
  venta: number;
  compra: number;
  updated: string;
}

export async function fetchTipoCambio(): Promise<number> {
  let data: GometaResponse;

  try {
    const response = await axios.get<GometaResponse>(GOMETA_URL, { timeout: 10_000 });
    data = response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[CRON] Error al obtener tipo de cambio de ${GOMETA_URL}: ${msg}`);
    process.exit(1);
  }

  const venta = data.venta;
  if (typeof venta !== 'number' || venta <= 0 || !isFinite(venta)) {
    console.error(`[CRON] Tipo de cambio invalido recibido de GoMeta: ${JSON.stringify(venta)}`);
    process.exit(1);
  }

  return venta;
}
