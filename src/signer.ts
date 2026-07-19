/**
 * Firma XAdES-EPES el XML de la factura usando el certificado .p12 del BCCR/SINPE.
 *
 * Proceso:
 * 1. Leer .p12 con node-forge → extraer llave privada y certificado
 * 2. Convertir a formato WebCrypto (Node.js crypto.subtle)
 * 3. Firmar con xadesjs (XAdES-EPES, RSA-SHA256)
 * 4. Retornar XML firmado + base64 para envío a API
 */

import forge from 'node-forge';
import { readFileSync } from 'fs';
import { Crypto } from '@peculiar/webcrypto';

// Polyfill WebCrypto para xadesjs en Node.js
const webcrypto = new Crypto();

// Singleton: inicializa xadesjs una sola vez por proceso
let _signedXmlClass: Awaited<ReturnType<typeof initXadesEngine>>['SignedXml'] | null = null;

async function initXadesEngine() {
  const { setNodeDependencies } = await import('xml-core');
  const { Application } = await import('xmldsigjs');
  const xmldom = await import('@xmldom/xmldom');
  setNodeDependencies({
    DOMParser: xmldom.DOMParser,
    XMLSerializer: xmldom.XMLSerializer,
    document: new xmldom.DOMImplementation().createDocument('', '', null),
  });
  Application.setEngine('nodeEngine', webcrypto);
  const { SignedXml } = await import('xadesjs');
  return { SignedXml };
}

async function getXadesEngine() {
  if (!_signedXmlClass) {
    const { SignedXml } = await initXadesEngine();
    _signedXmlClass = SignedXml;
  }
  return { SignedXml: _signedXmlClass };
}

export interface SignResult {
  xmlFirmado: string;
  xmlBase64: string;
}

/**
 * Carga el .p12 y retorna {privateKeyPem, certPem, certDer}
 */
function loadP12(p12Path: string, password: string) {
  const p12Buffer = readFileSync(p12Path);
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Extraer llave privada — convertir PKCS1 → PKCS8 para WebCrypto
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error('No se encontró llave privada en el .p12');
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyBag.key));
  const pkcs8Der = forge.asn1.toDer(pkcs8Asn1).getBytes();

  // Extraer certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error('No se encontró certificado en el .p12');
  const certPem = forge.pki.certificateToPem(certBag.cert);
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();

  return { pkcs8Der, certPem, certDer, forgeCert: certBag.cert };
}

/**
 * Convierte DER PKCS8 (binary string de forge) a CryptoKey (WebCrypto).
 */
async function pkcs8ToCryptoKey(pkcs8Der: string): Promise<CryptoKey> {
  const der = Buffer.from(pkcs8Der, 'binary');
  return webcrypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  ) as Promise<CryptoKey>;
}


/**
 * Firma el XML con XAdES-EPES y retorna el XML firmado + base64.
 *
 * Política de firma de Costa Rica (DGT):
 * - Identifier: https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/docs/esquemas/2016/v4.2/ResolucionComprobantesElectronicosDGT-R-48-2016_4.2.pdf
 * - Hash: SHA-256 del documento PDF de política
 *
 * NOTA: Si Hacienda rechaza por política, verifica el PDF actual en la resolución
 * DGT-R-000-2024 y actualiza POLICY_HASH abajo.
 */
export async function firmarXML(xmlString: string, p12Path: string, password: string): Promise<SignResult> {
  const { SignedXml } = await getXadesEngine();

  const { pkcs8Der, certPem, certDer } = loadP12(p12Path, password);
  const privateKey = await pkcs8ToCryptoKey(pkcs8Der);

  // Parsear XML con xmldom (requerido por xadesjs)
  const { DOMParser, XMLSerializer } = await import('@xmldom/xmldom');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

  // Política XAdES-EPES v4.4 — extraída de XML aceptado por Hacienda
  // URL y hash SHA-256 del PDF de resolución técnica vigente
  const POLICY_ID = 'https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/docs/esquemas/2024/v4.4/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
  const POLICY_HASH = 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8='; // SHA-256 base64

  const signedXml = new SignedXml();

  const certDerBase64 = Buffer.from(certDer, 'binary').toString('base64');

  const signature = await signedXml.Sign(
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } } as Algorithm,
    privateKey,
    xmlDoc,
    {
      x509: [certDerBase64],
      references: [
        {
          uri: '',
          hash: 'SHA-256',
          transforms: ['enveloped', 'c14n'],
        },
      ],
      signingCertificate: certDerBase64,
      signingTime: { value: new Date() },
      // Política de firma de Hacienda CR — XAdES-EPES
      // Si Hacienda rechaza por política, verificar hash SHA-1 del PDF actual
      policy: {
        identifier: { value: POLICY_ID },
        hash: 'SHA-256',
        digestValue: POLICY_HASH,
      },
    },
  );

  // Agregar firma al documento XML
  xmlDoc.documentElement.appendChild(signature.GetXml()!);

  const serializer = new XMLSerializer();
  const xmlFirmado = serializer.serializeToString(xmlDoc);
  const xmlBase64 = Buffer.from(xmlFirmado, 'utf-8').toString('base64');

  return { xmlFirmado, xmlBase64 };
}
