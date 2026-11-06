/** Erros de leitura de PDF (módulo leve, sem pdf.js, para a UI importar). */

export class PdfPasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? 'Senha incorreta.' : 'Este PDF é protegido por senha.');
    this.name = 'PdfPasswordError';
  }
}

export class PdfNoTextError extends Error {
  constructor() {
    super(
      'Não há texto selecionável neste PDF (provavelmente é uma imagem digitalizada). Baixe a fatura original no app ou site do banco.',
    );
    this.name = 'PdfNoTextError';
  }
}

export class PdfInvalidError extends Error {
  constructor() {
    super('Não foi possível abrir o arquivo. Verifique se é um PDF válido.');
    this.name = 'PdfInvalidError';
  }
}

export class UnsupportedFileError extends Error {
  constructor() {
    super(
      'Formato não suportado. Use o PDF da fatura/extrato ou o arquivo OFX/CSV exportado pelo banco.',
    );
    this.name = 'UnsupportedFileError';
  }
}
