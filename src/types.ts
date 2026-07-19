export interface Identificacion {
  tipo: '01' | '02' | '03' | '04';
  numero: string;
}

export interface Ubicacion {
  provincia: string;
  canton: string;
  distrito: string;
  barrio?: string;
  otrasSenas: string;
}

export interface Emisor {
  nombre: string;
  identificacion: Identificacion;
  codigoActividadEmisor: string;
  ubicacion: Ubicacion;
  correoElectronico: string;
}

export interface Receptor {
  nombre: string;
  identificacion: Identificacion;
  ubicacion?: Ubicacion;
  correoElectronico?: string;
}

export interface Exoneracion {
  tipoDocumentoEX1: string;
  numeroDocumento: string;
  inciso: string;
  nombreInstitucion: string;
  fechaEmisionEX: string;
  tarifaExonerada: number;
  montoExoneracion: number;
}

export interface Impuesto {
  codigo: string;
  codigoTarifaIVA: string;
  tarifa: number;
  monto: number;
  exoneracion?: Exoneracion;
}

export interface LineaDetalle {
  numeroLinea: number;
  cabys: string;
  cantidad: number;
  unidadMedida: string;
  detalle: string;
  precioUnitario: number;
  montoTotal: number;
  subtotal: number;
  baseImponible: number;
  impuesto?: Impuesto;
  impuestoAsumidoEmisorFabrica: number;
  impuestoNeto: number;
  montoTotalLinea: number;
}

export interface DesgloseImpuesto {
  codigo: string;
  codigoTarifaIVA: string;
  totalMontoImpuesto: number;
}

export interface MedioPago {
  tipoMedioPago: string;
  totalMedioPago: number;
}

export interface ResumenFactura {
  totalServGravados: number;
  totalServExonerado: number;
  totalGravado: number;
  totalExento: number;
  totalExonerado: number;
  totalNoSujeto: number;
  totalVenta: number;
  totalVentaNeta: number;
  totalDesgloseImpuesto: DesgloseImpuesto;
  totalImpuesto: number;
  medioPago: MedioPago;
  totalComprobante: number;
}

export interface ConsecutivoConfig {
  sucursal: string;
  caja: string;
  tipoDocumento: string;
}

export interface CertConfig {
  path: string;
}

export interface SandboxOverrides {
  tipoDocumentoEX1?: string;
}

export interface FacturaConfig {
  proveedorSistemas: string;
  emisor: Emisor;
  receptor: Receptor;
  codigoActividadReceptor: string;
  condicionVenta: string;
  moneda: string;
  lineaDetalle: LineaDetalle;
  resumenFactura: ResumenFactura;
  sandboxOverrides?: SandboxOverrides;
  cert: CertConfig;
  consecutivo: ConsecutivoConfig;
}

export interface FacturaArgs {
  tipoCambio: number;
  consecutivo: number;
}

export interface FacturaGenerada {
  clave: string;
  numeroConsecutivo: string;
  fechaEmision: string;
  xmlString: string;
}
