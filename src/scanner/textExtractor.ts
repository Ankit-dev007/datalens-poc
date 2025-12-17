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
                    console.warn(`Text extraction not supported for extension: ${ext} (${fileName}). Treating as raw text.`);
                    // Fallback to trying to read as text, might be risk for binaries but size checks usually precede this.
                    return buffer.toString('utf-8');
            }
        } catch (error: any) {
            console.error(`Failed to extract text from ${fileName}:`, error.message);
            return ""; // Return empty string on failure to allow process to continue
        }
    }

    private async extractPdf(buffer: Buffer): Promise<string> {
        const parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        return data.text;
    }

    private async extractDocx(buffer: Buffer): Promise<string> {
        const result = await mammoth.extractRawText({ buffer: buffer });
        return result.value; // The raw text
    }

    private extractSpreadsheet(buffer: Buffer): Promise<string> {
        // XLSX.read supports buffer input
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let fullText = "";

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            // Convert to CSV or JSON to get text content
            // sheet_to_csv provides a text representation
            const content = xlsx.utils.sheet_to_csv(sheet);
            fullText += `--- Sheet: ${sheetName} ---\n${content}\n`;
        });

        return Promise.resolve(fullText);
    }
}
