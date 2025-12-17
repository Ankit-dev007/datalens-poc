const { PDFParse } = require('pdf-parse');

async function test() {
    console.log('Testing PDFParse v2 API...');
    const buffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Hello World) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    
    try {
        const parser = new PDFParse({ data: buffer });
        console.log('Parser created.');
        const textResult = await parser.getText();
        console.log('Text result structure keys:', Object.keys(textResult));
        console.log('Text content:', textResult.text);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
