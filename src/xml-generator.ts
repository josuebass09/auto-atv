import { create } from 'xmlbuilder2';
import { randomInt } from 'crypto';
import type { FacturaConfig, FacturaArgs, FacturaGenerada } from './types.js';

const NAMESPACE = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
const XSD_LOCATION = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica.xsd';

/**
 * Genera NumeroConsecutivo de 20 dígitos.
 * Formato: [sucursal 3][caja 5][tipoDoc 2][secuencial 10]
 */
function generarNumeroConsecutivo(config: FacturaConfig, seq: number): string {
  const secuencial = String(seq).padStart(10, '0');
  return `${config.consecutivo.sucursal}${config.consecutivo.caja}${config.consecutivo.tipoDocumento}${secuencial}`;
}

/**
 * Genera Clave de 50 dígitos.
 * Formato: [país 3][ddMMyy 6][cedula 12][consecutivo 20][situacion 1][seguridad 8]
 */
function generarClave(config: FacturaConfig, numeroConsecutivo: string, fecha: Date): string {
  const pais = '506';
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear()).slice(-2);
  const cedula = config.emisor.identificacion.numero.padStart(12, '0');
  const situacion = '1'; // 1=normal, 2=contingencia, 3=sin internet
  const seguridad = randomInt(0, 100000000).toString().padStart(8, '0');
  return `${pais}${dia}${mes}${anio}${cedula}${numeroConsecutivo}${situacion}${seguridad}`;
}

/**
 * Formatea fecha en ISO 8601: YYYY-MM-DDTHH:mm:ss.000
 */
function formatFecha(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}.000`;
}

/**
 * Formatea número con 5 decimales para campos de monto/cantidad.
 */
function num5(n: number): string {
  return n.toFixed(5);
}

/**
 * Formatea número con 2 decimales para tarifas/porcentajes.
 */
function num2(n: number): string {
  return n.toFixed(2);
}

export function generarXML(config: FacturaConfig, args: FacturaArgs): FacturaGenerada {
  const fecha = new Date();
  const numeroConsecutivo = generarNumeroConsecutivo(config, args.consecutivo);
  const clave = generarClave(config, numeroConsecutivo, fecha);
  const fechaEmision = formatFecha(fecha);

  const linea = config.lineaDetalle;
  const resumen = config.resumenFactura;

  const root = create({ version: '1.0', encoding: 'utf-8' })
    .ele('FacturaElectronica', {
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
      xmlns: NAMESPACE,
      'xsi:schemaLocation': XSD_LOCATION,
    });

  root.ele('Clave').txt(clave);
  root.ele('ProveedorSistemas').txt(config.proveedorSistemas);
  root.ele('CodigoActividadEmisor').txt(config.emisor.codigoActividadEmisor);
  root.ele('CodigoActividadReceptor').txt(config.codigoActividadReceptor);
  root.ele('NumeroConsecutivo').txt(numeroConsecutivo);
  root.ele('FechaEmision').txt(fechaEmision);

  // Emisor
  const emisorNode = root.ele('Emisor');
  emisorNode.ele('Nombre').txt(config.emisor.nombre);
  const emisorId = emisorNode.ele('Identificacion');
  emisorId.ele('Tipo').txt(config.emisor.identificacion.tipo);
  emisorId.ele('Numero').txt(config.emisor.identificacion.numero);
  const emisorUbic = emisorNode.ele('Ubicacion');
  emisorUbic.ele('Provincia').txt(config.emisor.ubicacion.provincia);
  emisorUbic.ele('Canton').txt(config.emisor.ubicacion.canton);
  emisorUbic.ele('Distrito').txt(config.emisor.ubicacion.distrito);
  if (config.emisor.ubicacion.barrio) {
    emisorUbic.ele('Barrio').txt(config.emisor.ubicacion.barrio);
  }
  emisorUbic.ele('OtrasSenas').txt(config.emisor.ubicacion.otrasSenas);
  emisorNode.ele('CorreoElectronico').txt(config.emisor.correoElectronico);

  // Receptor
  const receptorNode = root.ele('Receptor');
  receptorNode.ele('Nombre').txt(config.receptor.nombre);
  const receptorId = receptorNode.ele('Identificacion');
  receptorId.ele('Tipo').txt(config.receptor.identificacion.tipo);
  receptorId.ele('Numero').txt(config.receptor.identificacion.numero);
  if (config.receptor.ubicacion) {
    const recUbic = receptorNode.ele('Ubicacion');
    recUbic.ele('Provincia').txt(config.receptor.ubicacion.provincia);
    recUbic.ele('Canton').txt(config.receptor.ubicacion.canton);
    recUbic.ele('Distrito').txt(config.receptor.ubicacion.distrito);
    if (config.receptor.ubicacion.barrio) {
      recUbic.ele('Barrio').txt(config.receptor.ubicacion.barrio);
    }
    recUbic.ele('OtrasSenas').txt(config.receptor.ubicacion.otrasSenas);
  }
  if (config.receptor.correoElectronico) {
    receptorNode.ele('CorreoElectronico').txt(config.receptor.correoElectronico);
  }

  root.ele('CondicionVenta').txt(config.condicionVenta);

  // Línea de detalle
  const lineaNode = root.ele('DetalleServicio').ele('LineaDetalle');
  lineaNode.ele('NumeroLinea').txt(String(linea.numeroLinea));
  lineaNode.ele('CodigoCABYS').txt(linea.cabys);
  lineaNode.ele('Cantidad').txt(num5(linea.cantidad));
  lineaNode.ele('UnidadMedida').txt(linea.unidadMedida);
  lineaNode.ele('Detalle').txt(linea.detalle);
  lineaNode.ele('PrecioUnitario').txt(num5(linea.precioUnitario));
  lineaNode.ele('MontoTotal').txt(num5(linea.montoTotal));
  lineaNode.ele('SubTotal').txt(num5(linea.subtotal));
  lineaNode.ele('BaseImponible').txt(num5(linea.baseImponible));

  if (linea.impuesto) {
    const impNode = lineaNode.ele('Impuesto');
    impNode.ele('Codigo').txt(linea.impuesto.codigo);
    impNode.ele('CodigoTarifaIVA').txt(linea.impuesto.codigoTarifaIVA);
    impNode.ele('Tarifa').txt(num2(linea.impuesto.tarifa));
    impNode.ele('Monto').txt(num5(linea.impuesto.monto));

    if (linea.impuesto.exoneracion) {
      const exo = linea.impuesto.exoneracion;
      const exoNode = impNode.ele('Exoneracion');
      exoNode.ele('TipoDocumentoEX1').txt(exo.tipoDocumentoEX1);
      exoNode.ele('NumeroDocumento').txt(exo.numeroDocumento);
      exoNode.ele('Inciso').txt(exo.inciso);
      exoNode.ele('NombreInstitucion').txt(exo.nombreInstitucion);
      exoNode.ele('FechaEmisionEX').txt(exo.fechaEmisionEX);
      exoNode.ele('TarifaExonerada').txt(num2(exo.tarifaExonerada));
      exoNode.ele('MontoExoneracion').txt(num5(exo.montoExoneracion));
    }
  }

  lineaNode.ele('ImpuestoAsumidoEmisorFabrica').txt(num5(linea.impuestoAsumidoEmisorFabrica));
  lineaNode.ele('ImpuestoNeto').txt(num5(linea.impuestoNeto));
  lineaNode.ele('MontoTotalLinea').txt(num5(linea.montoTotalLinea));

  // Resumen
  const resumenNode = root.ele('ResumenFactura');
  const monedaNode = resumenNode.ele('CodigoTipoMoneda');
  monedaNode.ele('CodigoMoneda').txt(config.moneda);
  monedaNode.ele('TipoCambio').txt(num5(args.tipoCambio));

  resumenNode.ele('TotalServGravados').txt(num5(resumen.totalServGravados));
  resumenNode.ele('TotalServExonerado').txt(num5(resumen.totalServExonerado));
  resumenNode.ele('TotalGravado').txt(num5(resumen.totalGravado));
  resumenNode.ele('TotalExento').txt(num5(resumen.totalExento));
  resumenNode.ele('TotalExonerado').txt(num5(resumen.totalExonerado));
  resumenNode.ele('TotalNoSujeto').txt(num5(resumen.totalNoSujeto));
  resumenNode.ele('TotalVenta').txt(num5(resumen.totalVenta));
  resumenNode.ele('TotalVentaNeta').txt(num5(resumen.totalVentaNeta));

  const desgloseNode = resumenNode.ele('TotalDesgloseImpuesto');
  desgloseNode.ele('Codigo').txt(resumen.totalDesgloseImpuesto.codigo);
  desgloseNode.ele('CodigoTarifaIVA').txt(resumen.totalDesgloseImpuesto.codigoTarifaIVA);
  desgloseNode.ele('TotalMontoImpuesto').txt(num5(resumen.totalDesgloseImpuesto.totalMontoImpuesto));

  resumenNode.ele('TotalImpuesto').txt(num5(resumen.totalImpuesto));

  const mpNode = resumenNode.ele('MedioPago');
  mpNode.ele('TipoMedioPago').txt(resumen.medioPago.tipoMedioPago);
  mpNode.ele('TotalMedioPago').txt(num5(resumen.medioPago.totalMedioPago));

  resumenNode.ele('TotalComprobante').txt(num5(resumen.totalComprobante));

  const xmlString = root.end({ prettyPrint: true });

  return { clave, numeroConsecutivo, fechaEmision, xmlString };
}
