import ora from 'ora';
import { getCreds } from '../env.js';
import { obtenerToken, consultarComprobante, consultarComprobantes } from '../api-client.js';

type Env = 'production' | 'sandbox';

const envLabel = (env: Env) =>
  env === 'production' ? '\x1b[31mPRODUCCION\x1b[0m' : '\x1b[33msandbox\x1b[0m';

export async function consultar(args: Record<string, string>, env: Env): Promise<void> {
  const { username, password } = getCreds(env);
  if (!username || !password) {
    console.error(`\nError: Configura HACIENDA_USERNAME_${env.toUpperCase()} y HACIENDA_PASSWORD_${env.toUpperCase()} en .env`);
    process.exit(1);
  }

  console.log(`\nConsulta comprobantes | ${envLabel(env)}\n`);

  const spin = ora('Obteniendo token OAuth...').start();
  const token = await obtenerToken({ env, username, password });
  spin.succeed('Token obtenido');

  const clave = args['clave'];

  if (clave) {
    await consultarPorClave(token, env, clave);
  } else {
    await consultarLista(token, env, args);
  }
}

async function consultarPorClave(token: string, env: Env, clave: string): Promise<void> {
  const spin = ora(`Consultando clave ${clave}...`).start();
  const comp = await consultarComprobante(token, env, clave);
  spin.succeed('Comprobante encontrado');

  console.log('\nComprobante:');
  console.log(JSON.stringify(comp, null, 2));

  if (comp.notasCredito?.length) {
    console.log(`\n   Notas de credito: ${comp.notasCredito.length}`);
    comp.notasCredito.forEach(n => console.log(`   - ${n.clave} (${n.fecha})`));
  }
  if (comp.notasDebito?.length) {
    console.log(`\n   Notas de debito: ${comp.notasDebito.length}`);
    comp.notasDebito.forEach(n => console.log(`   - ${n.clave} (${n.fecha})`));
  }
}

async function consultarLista(token: string, env: Env, args: Record<string, string>): Promise<void> {
  const params = {
    emisor:   args['emisor'],
    receptor: args['receptor'],
    offset:   args['offset'] ? parseInt(args['offset'], 10) : undefined,
    limit:    args['limit']  ? parseInt(args['limit'],  10) : undefined,
  };

  if (!params.emisor && !params.receptor) {
    console.error('Error: --consulta requiere --clave, --emisor o --receptor');
    process.exit(1);
  }

  const spin = ora('Consultando comprobantes...').start();
  const result = await consultarComprobantes(token, env, params);
  spin.succeed(`${result.items.length} comprobante${result.items.length !== 1 ? 's' : ''}`);

  if (result.items.length === 0) {
    console.log('\n   Sin resultados.\n');
    return;
  }

  console.log('\nComprobantes:');
  for (const item of result.items) {
    const emisorId   = `${item.emisor.tipoIdentificacion}-${item.emisor.numeroIdentificacion}`;
    const receptorId = `${item.receptor.tipoIdentificacion}-${item.receptor.numeroIdentificacion}`;
    console.log(`\n  Clave:    ${item.clave}`);
    console.log(`  Fecha:    ${item.fecha}`);
    console.log(`  Emisor:   ${emisorId}${item.emisor.nombre   ? ' ' + item.emisor.nombre   : ''}`);
    console.log(`  Receptor: ${receptorId}${item.receptor.nombre ? ' ' + item.receptor.nombre : ''}`);
    if (item.notasCredito?.length) console.log(`  NC: ${item.notasCredito.length}`);
    if (item.notasDebito?.length)  console.log(`  ND: ${item.notasDebito.length}`);
  }

  const showPagination = result.hasMore || result.offset > 0;
  if (showPagination) {
    console.log(`\n   Pagina: offset=${result.offset} limit=${result.limit}`);
    if (result.systemTotal !== undefined) console.log(`   Total sistema: ${result.systemTotal}`);
    if (result.hasMore) {
      console.log(`   Siguiente: --offset=${result.offset + result.items.length} --limit=${result.limit}`);
    } else {
      console.log(`   Fin de resultados.`);
    }
  }
  console.log();
}
