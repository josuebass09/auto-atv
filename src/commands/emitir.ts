import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'node:readline/promises';
import ora from 'ora';
import { getCreds } from '../env.js';
import { loadConfig, applyEnvOverrides, guardProduccion } from '../config.js';
import { generarXML } from '../xml-generator.js';
import { firmarXML } from '../signer.js';
import { enviarYEsperar } from '../api-client.js';

type Env = 'production' | 'sandbox';

const envLabel = (env: Env) =>
  env === 'production' ? '\x1b[31mPRODUCCION\x1b[0m' : '\x1b[33msandbox\x1b[0m';

async function confirmarProduccion(consecutivo: number, clave: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n\x1b[31m[!] PRODUCCION -- factura real #${consecutivo}\x1b[0m`);
  console.log(`   Clave: ${clave}`);
  const resp = await rl.question('   Escribe CONFIRMAR para enviar: ');
  rl.close();
  if (resp.trim() !== 'CONFIRMAR') {
    console.log('\nCancelado. XML firmado guardado, no enviado.\n');
    process.exit(0);
  }
}

export async function emitir(
  args: Record<string, string>,
  env: Env,
  root: string,
): Promise<void> {
  const tipoCambio  = parseFloat(args['tipo-cambio'] ?? args['tc'] ?? '');
  const consecutivo = parseInt(args['consecutivo']   ?? args['seq'] ?? '', 10);
  const dryRun      = args['dry-run'] === 'true';
  const cliente    = args['cliente'];
  if (!cliente && !args['config']) {
    console.error('Error: --cliente es obligatorio (ej: --cliente=cress)');
    process.exit(1);
  }
  const configPath = args['config'] ?? join(root, 'config', 'templates', cliente!, 'factura.config.json');

  let config = loadConfig(configPath);
  config = applyEnvOverrides(config, env);

  if (env === 'production') {
    try {
      guardProduccion(config);
    } catch (e) {
      console.error(`\n[ERROR] ${(e as Error).message}\n`);
      process.exit(1);
    }
  }

  console.log(`\nFactura #${consecutivo} | TC: ${tipoCambio} | ${envLabel(env)}${dryRun ? ' | DRY-RUN' : ''}\n`);

  // 1. Generar XML
  const spin1 = ora('Generando XML v4.4...').start();
  const { clave, numeroConsecutivo, fechaEmision, xmlString } = generarXML(config, { tipoCambio, consecutivo });
  spin1.succeed('XML generado');
  console.log(`   \x1b[2mClave:       ${clave}\x1b[0m`);
  console.log(`   \x1b[2mConsecutivo: ${numeroConsecutivo}\x1b[0m`);
  console.log(`   \x1b[2mFecha:       ${fechaEmision}\x1b[0m`);

  // 2. Firmar XML
  const { username, password, certPassword } = getCreds(env);
  const spin2 = ora('Firmando con XAdES-EPES...').start();
  const { xmlFirmado, xmlBase64 } = await firmarXML(xmlString, resolve(root, config.cert.path), certPassword);
  spin2.succeed('Firma XAdES-EPES aplicada');

  // 3. Guardar archivos
  const outDir = join(root, 'output', env, `${fechaEmision.slice(0, 10)}_${consecutivo}`);
  const spin3 = ora('Guardando archivos...').start();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'factura.xml'), xmlString, 'utf-8');
  writeFileSync(join(outDir, 'factura_firmada.xml'), xmlFirmado, 'utf-8');
  spin3.succeed(`Archivos guardados en \x1b[32moutput/${env}/${fechaEmision.slice(0, 10)}_${consecutivo}/\x1b[0m`);

  if (dryRun) {
    console.log(`\nDRY-RUN completo.`);
    console.log(`    Archivos: \x1b[32m${outDir}\x1b[0m\n`);
    return;
  }

  // 4. Enviar a Hacienda
  if (!username || !password) {
    console.error(`\nError: Configura HACIENDA_USERNAME_${env.toUpperCase()} y HACIENDA_PASSWORD_${env.toUpperCase()} en .env`);
    process.exit(1);
  }

  if (env === 'production' && args['yes'] !== 'true') {
    await confirmarProduccion(consecutivo, clave);
  }

  const spin4 = ora('Obteniendo token OAuth...').start();
  const estado = await enviarYEsperar(
    { env, username, password },
    {
      clave,
      fecha: fechaEmision,
      emisor: {
        tipoIdentificacion: config.emisor.identificacion.tipo,
        numeroIdentificacion: config.emisor.identificacion.numero,
      },
      receptor: {
        tipoIdentificacion: config.receptor.identificacion.tipo,
        numeroIdentificacion: config.receptor.identificacion.numero,
      },
      comprobanteXml: xmlBase64,
    },
    (msg) => { spin4.text = msg; },
  );

  writeFileSync(join(outDir, 'response_hacienda.json'), JSON.stringify(estado, null, 2), 'utf-8');

  if (estado['respuesta-xml']) {
    const respXml = Buffer.from(estado['respuesta-xml'], 'base64').toString('utf-8');
    writeFileSync(join(outDir, 'respuesta_hacienda.xml'), respXml, 'utf-8');
    const extract = (tag: string) => respXml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'))?.[1]?.trim() ?? null;

    if (estado['ind-estado'] === 'aceptado') {
      spin4.succeed('Factura ACEPTADA por Hacienda');
    } else {
      spin4.fail(`Factura ${estado['ind-estado'].toUpperCase()}`);
    }

    console.log('\nRespuesta Hacienda:');
    console.log(JSON.stringify({
      EstadoMensaje:     extract('EstadoMensaje'),
      Mensaje:           extract('Mensaje'),
      DetalleMensaje:    extract('DetalleMensaje'),
      MontoTotalImpuesto: extract('MontoTotalImpuesto'),
      TotalFactura:      extract('TotalFactura'),
    }, null, 2));
  } else {
    if (estado['ind-estado'] === 'aceptado') {
      spin4.succeed('Factura ACEPTADA por Hacienda');
    } else {
      spin4.fail(`Factura ${estado['ind-estado'].toUpperCase()}`);
    }
  }

  if (estado['ind-estado'] === 'aceptado') {
    console.log(`\n[OK] Clave: ${clave}`);
    console.log(`    Archivos: \x1b[32moutput/${env}/${fechaEmision.slice(0, 10)}_${consecutivo}/\x1b[0m\n`);
  } else {
    process.exit(1);
  }
}
