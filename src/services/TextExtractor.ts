import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

export class TextExtractor {

    /**
     * Extracts text from a file buffer based on its extension/mimetype.
     * @param buffer File content as Buffer
     * @param fileName File name to determine extension
     * @returns Extracted text string
     */
    async extractText(buffer: Buffer, fileName: string): Promise<string> {
        const ext = path.extname(fileName).toLowerCase();

        try {
            switch (ext) {
                case '.pdf':
                    return await this.extractPdf(buffer);
                case '.docx':
                    return await this.extractDocx(buffer);
                case '.xlsx':
                case '.xls':
                case '.csv':
                    return this.extractSpreadsheet(buffer);
                case '.txt':
                case '.log':
                case '.json':
                case '.xml':
                case '.md':
                case '.ts':
                case '.js':
                    return buffer.toString('utf-8');
                default:
                    // console.warn(`Text extraction not supported for extension: ${ext} (${fileName}). Treating as raw text.`);
                    // Try blindly as text for unknown types, often config files etc.
                    return buffer.toString('utf-8');
            }
        } catch (error: any) {
            console.error(`Failed to extract text from ${fileName}:`, error.message);
            return "";
        }
    }

    private async extractPdf(buffer: Buffer): Promise<string> {
        // PDFParse default export issue handling
        // Sometimes PDFParse is import * as PDFParse or default
        // In the existing code it was: import { PDFParse } from 'pdf-parse';
        // But typically pdf-parse exports a function. Let's stick to the working pattern if known.
        // Actually, the existing code: `new PDFParse` suggests it's a class or constructor.
        // Let's rely on how the user had it or standard usage. 
        // Standard `pdf-parse` is: const pdf = require('pdf-parse'); let data = await pdf(dataBuffer);
        // But if they have a wrapper, let's look. The previous file imported `{ PDFParse }`.
        // I will assume the package is `pdf-parse` and usage `const data = await pdf(buffer)`.
        // Wait, looking at previous file `src/scanner/textExtractor.ts`:
        // `import { PDFParse } from 'pdf-parse'; ... const parser = new PDFParse({ data: buffer });`
        // This looks like a custom wrapper or a specific version. 
        // Standard pdf-parse does NOT work like that.
        // Let's try standard import since I installed dependencies? No, I didn't install pdf-parse, it was already there.
        // I will check `package.json` again. `pdf-parse`: `^2.4.5`.
        // Standard `pdf-parse` usage: 
        // import pdf from 'pdf-parse'; 
        // const data = await pdf(buffer);
        // I will switch to standard usage to be safe, unless `pdf-parse` types are weird.
        const parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        console.log("PDF data", data);
        return data.text;
    }

    private async extractDocx(buffer: Buffer): Promise<string> {
        const result = await mammoth.extractRawText({ buffer: buffer });
        return result.value;
    }

    private extractSpreadsheet(buffer: Buffer): Promise<string> {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let fullText = "";

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const content = xlsx.utils.sheet_to_csv(sheet);
            fullText += `--- Sheet: ${sheetName} ---\n${content}\n`;
        });

        return Promise.resolve(fullText);
    }
}
