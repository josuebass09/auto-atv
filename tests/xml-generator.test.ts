import { DOMParser } from '@xmldom/xmldom';
import { generarXML } from '../src/xml-generator.js';
import { getCreds } from '../src/env.js';
import { loadConfig, applyEnvOverrides, guardProduccion } from '../src/config.js';

const config = loadConfig('config/templates/cress/factura.config.json');
const { xmlString } = generarXML(config, { tipoCambio: 465.15, consecutivo: 6 });
const doc = new DOMParser().parseFromString(xmlString, 'application/xml');

const txt      = (tag: string) => (doc.getElementsByTagName(tag)[0] as any)?.textContent ?? '';
const has      = (tag: string) => doc.getElementsByTagName(tag).length > 0;
const parentOf = (tag: string) => (doc.getElementsByTagName(tag)[0] as any)?.parentNode?.tagName ?? '';
const decimals = (tag: string) => (txt(tag).split('.')[1] ?? '').length;

describe('Integridad XML v4.4', () => {

  describe('Encabezado', () => {
    it('incluye <ProveedorSistemas>',                    () => expect(txt('ProveedorSistemas')).toBe(config.proveedorSistemas));
    it('incluye <CodigoActividadEmisor>',                () => expect(txt('CodigoActividadEmisor')).toBe(config.emisor.codigoActividadEmisor));
    it('<CodigoActividadReceptor> es hijo de raíz',      () => expect(parentOf('CodigoActividadReceptor')).toBe('FacturaElectronica'));
  });

  describe('LineaDetalle', () => {
    it('usa <CodigoCABYS> (no Codigo con atributo)',     () => expect(txt('CodigoCABYS')).toBe(config.lineaDetalle.cabys));
    it('usa <CodigoTarifaIVA> (no <CodigoTarifa>)',      () => { expect(has('CodigoTarifaIVA')).toBe(true); expect(has('CodigoTarifa')).toBe(false); });
    it('<BaseImponible> pertenece a LineaDetalle',        () => expect(parentOf('BaseImponible')).toBe('LineaDetalle'));
    it('<ImpuestoAsumidoEmisorFabrica> en LineaDetalle', () => expect(parentOf('ImpuestoAsumidoEmisorFabrica')).toBe('LineaDetalle'));
    it('<ImpuestoNeto> pertenece a LineaDetalle',        () => expect(parentOf('ImpuestoNeto')).toBe('LineaDetalle'));
    it('Cantidad tiene 5 decimales',                     () => expect(decimals('Cantidad')).toBe(5));
    it('PrecioUnitario tiene 5 decimales',               () => expect(decimals('PrecioUnitario')).toBe(5));
  });

  describe('Exoneración', () => {
    it('usa <TipoDocumentoEX1> (no <TipoDocumentoEx>)',  () => { expect(has('TipoDocumentoEX1')).toBe(true); expect(has('TipoDocumentoEx')).toBe(false); });
    it('<Inciso> pertenece a Exoneracion',               () => expect(parentOf('Inciso')).toBe('Exoneracion'));
    it('usa <FechaEmisionEX>',                           () => expect(has('FechaEmisionEX')).toBe(true));
    it('<TarifaExonerada> tiene 2 decimales',            () => expect(decimals('TarifaExonerada')).toBe(2));
    it('<MontoExoneracion> tiene 5 decimales',           () => expect(decimals('MontoExoneracion')).toBe(5));
    it('<PorcentajeExoneracion> no existe en v4.4',      () => expect(has('PorcentajeExoneracion')).toBe(false));
  });

  describe('ResumenFactura', () => {
    it('<MedioPago> pertenece a ResumenFactura',         () => expect(parentOf('MedioPago')).toBe('ResumenFactura'));
    it('<TipoMedioPago> pertenece a MedioPago',          () => expect(parentOf('TipoMedioPago')).toBe('MedioPago'));
    it('<TotalDesgloseImpuesto> en ResumenFactura',      () => expect(parentOf('TotalDesgloseImpuesto')).toBe('ResumenFactura'));
    it('usa <TotalServExonerado> (no <TotalServExonerada>)', () => { expect(has('TotalServExonerado')).toBe(true); expect(has('TotalServExonerada')).toBe(false); });
    it('<TipoCambio> refleja el argumento recibido',     () => expect(txt('TipoCambio')).toBe('465.15000'));
  });

  describe('Overrides de ambiente', () => {
    it('producción usa TipoDocumentoEX1 = "04" del config base', () => {
      const cfg = applyEnvOverrides(loadConfig('config/templates/cress/factura.config.json'),'production');
      const { xmlString: xml } = generarXML(cfg, { tipoCambio: 465.15, consecutivo: 6 });
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      expect((d.getElementsByTagName('TipoDocumentoEX1')[0] as any)?.textContent).toBe('04');
    });

    it('guard producción lanza error si TipoDocumentoEX1 no es "04"', () => {
      const cfg = loadConfig('config/templates/cress/factura.config.json');
      cfg.lineaDetalle.impuesto!.exoneracion!.tipoDocumentoEX1 = '01';
      expect(() => guardProduccion(cfg)).toThrow(/"04"/);
    });

    it('guard producción no lanza error cuando TipoDocumentoEX1 es "04"', () => {
      const cfg = applyEnvOverrides(loadConfig('config/templates/cress/factura.config.json'),'production');
      expect(() => guardProduccion(cfg)).not.toThrow();
    });

    it('sandbox usa TipoDocumentoEX1 = "01" del sandboxOverrides', () => {
      const cfg = applyEnvOverrides(loadConfig('config/templates/cress/factura.config.json'),'sandbox');
      const { xmlString: xml } = generarXML(cfg, { tipoCambio: 465.15, consecutivo: 6 });
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      expect((d.getElementsByTagName('TipoDocumentoEX1')[0] as any)?.textContent).toBe('01');
    });
  });

  describe('Namespace y schema', () => {
    it('namespace apunta a v4.4',                        () => expect(xmlString).toContain('xml-schemas/v4.4/facturaElectronica"'));
    it('XSD apunta a cdn (no a atv)',                    () => expect(xmlString).toContain('cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica.xsd'));
  });
});

describe('Credenciales por ambiente', () => {
  const CLAVES = [
    'HACIENDA_USERNAME_PRODUCTION', 'HACIENDA_PASSWORD_PRODUCTION',
    'HACIENDA_USERNAME_SANDBOX', 'HACIENDA_PASSWORD_SANDBOX',
    'HACIENDA_USERNAME', 'HACIENDA_PASSWORD',
  ];
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => { for (const k of CLAVES) { backup[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of CLAVES) { if (backup[k] === undefined) delete process.env[k]; else process.env[k] = backup[k]; } });

  it('producción toma las variables _PRODUCTION', () => {
    process.env['HACIENDA_USERNAME_PRODUCTION'] = 'user-prod';
    process.env['HACIENDA_PASSWORD_PRODUCTION'] = 'pass-prod';
    expect(getCreds('production')).toEqual({ username: 'user-prod', password: 'pass-prod', certPassword: '' });
  });

  it('sandbox toma las variables _SANDBOX', () => {
    process.env['HACIENDA_USERNAME_SANDBOX'] = 'user-stag';
    process.env['HACIENDA_PASSWORD_SANDBOX'] = 'pass-stag';
    expect(getCreds('sandbox')).toEqual({ username: 'user-stag', password: 'pass-stag', certPassword: '' });
  });

  it('cae en variables sin prefijo cuando falta la prefijada', () => {
    process.env['HACIENDA_USERNAME'] = 'user-legacy';
    process.env['HACIENDA_PASSWORD'] = 'pass-legacy';
    expect(getCreds('production')).toEqual({ username: 'user-legacy', password: 'pass-legacy', certPassword: '' });
  });

  it('la variable prefijada tiene prioridad sobre la sin prefijo', () => {
    process.env['HACIENDA_USERNAME'] = 'user-legacy';
    process.env['HACIENDA_USERNAME_SANDBOX'] = 'user-stag';
    expect(getCreds('sandbox').username).toBe('user-stag');
  });

  it('retorna vacío cuando no hay ninguna variable', () => {
    expect(getCreds('production')).toEqual({ username: '', password: '', certPassword: '' });
  });
});
