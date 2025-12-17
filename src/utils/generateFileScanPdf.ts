import PDFDocument from "pdfkit";

export function generateFileScanPdf({ storageType, timestamp, totalFiles, totalPii, items }: any) {
    return new Promise((resolve) => {
        const doc = new PDFDocument();
        const chunks: any[] = [];

        doc.on("data", chunk => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));

        // HEADER
        doc.fontSize(22).text("File Scan Report", { underline: true });
        doc.moveDown();

        doc.fontSize(12).text(`Storage Type: ${storageType}`);
        doc.text(`Generated On: ${timestamp}`);
        doc.moveDown();

        // SUMMARY
        doc.fontSize(14).text("Summary", { underline: true });
        doc.fontSize(12).text(`• Total Files Scanned: ${totalFiles}`);
        doc.text(`• Total PII Records Found: ${totalPii}`);
        doc.moveDown();

        // DETAILS
        doc.fontSize(14).text("Detected PII", { underline: true });
        doc.moveDown();

        items.forEach((item: any, i: any) => {
            doc.fontSize(11).text(
                `${i + 1}. File: ${item.file} | Type: ${item.type} | Count: ${item.count} | Risk: ${item.risk}`
            );
        });

        doc.end();
    });
}
