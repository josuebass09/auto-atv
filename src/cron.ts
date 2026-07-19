#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { emitir } from './commands/emitir.js';
import { fetchTipoCambio } from './services/tipo-cambio.js';
import { updateRailwayVar } from './services/railway.js';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DIR = '/tmp/factura-cron';

function decodeCert(): void {
  const b64 = process.env['CERT_P12_BASE64'];
  if (!b64) return;
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(`${TMP_DIR}/cert.p12`, Buffer.from(b64, 'base64'));
  console.log('[CRON] Certificado decodificado de CERT_P12_BASE64');
}

function decodeConfig(): string | null {
  const json = process.env['FACTURA_CONFIG_JSON'];
  if (!json) return null;

  mkdirSync(TMP_DIR, { recursive: true });
  const configPath = `${TMP_DIR}/factura.config.json`;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(json) as Record<string, unknown>;
  } catch {
    console.error('[CRON] FACTURA_CONFIG_JSON no es JSON valido');
    process.exit(1);
  }

  // Si cert fue decodificado a temp dir, apuntar path al archivo temporal
  if (process.env['CERT_P12_BASE64'] && config['cert'] && typeof config['cert'] === 'object') {
    config['cert'] = { ...(config['cert'] as Record<string, unknown>), path: `${TMP_DIR}/cert.p12` };
  }

  writeFileSync(configPath, JSON.stringify(config), 'utf-8');
  console.log('[CRON] Config decodificada de FACTURA_CONFIG_JSON');
  return configPath;
}

async function main(): Promise<void> {
  const env           = (process.env['API_ENV'] ?? 'sandbox') as 'production' | 'sandbox';
  const consecutivoRaw = process.env['CONSECUTIVO'];
  const cliente        = process.env['CLIENTE'];

  if (!consecutivoRaw) {
    console.error('[CRON] Error: env var CONSECUTIVO no definido');
    process.exit(1);
  }
  const consecutivo = parseInt(consecutivoRaw, 10);
  if (isNaN(consecutivo) || consecutivo <= 0) {
    console.error(`[CRON] Error: CONSECUTIVO invalido: "${consecutivoRaw}"`);
    process.exit(1);
  }

  // 1. Tipo de cambio (falla y sale con exit 1 si hay error)
  const tipoCambio = await fetchTipoCambio();
  console.log(`[CRON] Tipo de cambio venta: ${tipoCambio}`);

  // 2. Preparar cert y config (Railway: desde env vars; local: desde archivos)
  decodeCert();
  const tmpConfigPath = decodeConfig();

  // 3. Construir args para emitir()
  const args: Record<string, string> = {
    'tipo-cambio': String(tipoCambio),
    consecutivo:   String(consecutivo),
    yes:           'true',
  };

  if (tmpConfigPath) {
    args['config'] = tmpConfigPath;
  } else if (cliente) {
    args['cliente'] = cliente;
  } else {
    console.error('[CRON] Error: necesita FACTURA_CONFIG_JSON o CLIENTE env var');
    process.exit(1);
  }

  // 4. Emitir factura
  console.log(`[CRON] Emitiendo factura #${consecutivo} | TC: ${tipoCambio} | env: ${env}`);
  await emitir(args, env, ROOT);

  // 5. Actualizar CONSECUTIVO en Railway para el proximo cron
  const siguiente = consecutivo + 1;
  await updateRailwayVar('CONSECUTIVO', String(siguiente));
  console.log(`[CRON] CONSECUTIVO actualizado a ${siguiente}`);
}

main().catch((err) => {
  console.error('[CRON FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
