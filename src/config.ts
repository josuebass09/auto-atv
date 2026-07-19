import { readFileSync } from 'fs';
import type { FacturaConfig } from './types.js';

export function loadConfig(path: string): FacturaConfig {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as FacturaConfig;
  } catch {
    throw new Error(`No se pudo leer config: ${path}`);
  }
}

export function applyEnvOverrides(config: FacturaConfig, env: 'production' | 'sandbox'): FacturaConfig {
  if (env !== 'sandbox') return config;
  const ov = config.sandboxOverrides;
  if (!ov?.tipoDocumentoEX1 || !config.lineaDetalle.impuesto?.exoneracion) return config;

  return {
    ...config,
    lineaDetalle: {
      ...config.lineaDetalle,
      impuesto: {
        ...config.lineaDetalle.impuesto!,
        exoneracion: {
          ...config.lineaDetalle.impuesto!.exoneracion!,
          tipoDocumentoEX1: ov.tipoDocumentoEX1,
        },
      },
    },
  };
}

export function guardProduccion(config: FacturaConfig): void {
  const tipo = config.lineaDetalle.impuesto?.exoneracion?.tipoDocumentoEX1;
  if (tipo !== '04') {
    throw new Error(
      `TipoDocumentoEX1 debe ser "04" en produccion. Valor actual: "${tipo}". Verifica config antes de continuar.`,
    );
  }
}
