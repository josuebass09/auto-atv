#!/usr/bin/env node
import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { emitir } from './commands/emitir.js';
import { consultar } from './commands/consultar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type Env = 'production' | 'sandbox';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--?([a-z-]+)(?:=(.+))?$/);
    if (match) args[match[1]] = match[2] ?? 'true';
  }
  return args;
}

function usage(): never {
  console.error(`
Uso: npm run factura -- [opciones]

Ejemplos:
  npm run factura -- --cliente=cress --tc=530.45 --seq=1
  npm run factura -- --cliente=cress --tc=530.45 --seq=1 --env=production
  npm run factura -- --cliente=cress --tc=530.45 --seq=1 --dry-run
  npm run factura -- --consulta --cliente=cress --emisor=01012345678
  npm run factura -- --consulta --cliente=cress --clave=506...

Modo emision:
  --cliente=<nombre>  Carpeta en config/templates/ (obligatorio)
  --tc, --tipo-cambio Tipo de cambio USD->CRC
  --seq, --consecutivo Numero secuencial de la factura
  --dry-run           Genera XML firmado pero NO envia a Hacienda
  --config=<path>     Ruta directa al JSON (sobreescribe --cliente)

Modo consulta:
  --consulta              Activa modo consulta
  --cliente=<nombre>      Carpeta en config/templates/ (obligatorio)
  --clave=<50chars>       Consulta comprobante por clave
  --emisor=<tipoNumero>   Filtro por emisor
  --receptor=<tipoNumero> Filtro por receptor
  --offset=<n>            Paginacion: inicio (default: 0)
  --limit=<n>             Items por pagina, max 50 (default: 5)

Opciones comunes:
  --env=sandbox|production  (default: API_ENV en .env, o sandbox)
  --yes                     Salta confirmacion en produccion
`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env  = (args['env'] ?? process.env['API_ENV'] ?? 'sandbox') as Env;

  if (args['consulta'] === 'true') {
    await consultar(args, env);
    return;
  }

  const hasTc  = args['tipo-cambio'] ?? args['tc'];
  const hasSeq = args['consecutivo'] ?? args['seq'];
  if (!hasTc || !hasSeq) usage();

  const tipoCambio  = parseFloat(hasTc);
  const consecutivo = parseInt(hasSeq, 10);

  if (isNaN(tipoCambio) || tipoCambio <= 0) {
    console.error('Error: --tipo-cambio debe ser un numero positivo');
    process.exit(1);
  }
  if (isNaN(consecutivo) || consecutivo <= 0) {
    console.error('Error: --consecutivo debe ser un entero positivo');
    process.exit(1);
  }

  await emitir({ ...args, 'tipo-cambio': String(tipoCambio), consecutivo: String(consecutivo) }, env, ROOT);
}

main().catch((err) => {
  console.error('\n[ERROR]', err instanceof Error ? err.message : err);
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response: { status: number; data: unknown } }).response;
    console.error(`    HTTP ${res.status}:`, JSON.stringify(res.data, null, 2));
  }
  process.exit(1);
});
