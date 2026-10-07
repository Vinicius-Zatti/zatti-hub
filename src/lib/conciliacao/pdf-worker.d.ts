// O pdfjs-dist não publica tipos do worker; só o objeto do módulo é usado.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
