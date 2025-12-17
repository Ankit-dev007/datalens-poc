import PDFDocument from "pdfkit";

export function generateScanPdf({ dbType, database, timestamp, totalTables, totalPii, items }: any) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: any[] = [];

        doc.on("data", (chunk: any) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));

        // ----- HEADER -----
        doc.fontSize(24).text("DPDP Compliance Scan Report", { underline: true, align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Generated On: ${new Date(timestamp).toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        doc.fontSize(14).font('Helvetica-Bold').text("Target Information");
        doc.fontSize(12).font('Helvetica').text(`Database Name: ${database}`);
        doc.text(`Database Type: ${dbType}`);
        doc.moveDown();

        // ----- STATS CALCULATION -----
        const riskCounts = { High: 0, Medium: 0, Low: 0 };
        const categoryCounts: Record<string, number> = {};

        items.forEach((item: any) => {
            const risk = (item.risk as keyof typeof riskCounts) || 'Low';
            riskCounts[risk]++;

            const cat = item.category || 'Uncategorized';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        // ----- EXECUTIVE SUMMARY -----
        doc.fontSize(16).font('Helvetica-Bold').text(`Executive Summary`, { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(`Total Tables Scanned: ${totalTables}`);
        doc.text(`Total PII Records Found: ${totalPii}`);
        doc.moveDown();

        // DPDP Risk Breakdown
        doc.fontSize(14).font('Helvetica-Bold').text("Risk Analysis (DPDP Aligned)", { underline: true });
        doc.moveDown(0.5);

        doc.fillColor('red').text(`• High Risk (Aadhaar, PAN, Health, Financial): ${riskCounts.High}`);
        doc.fillColor('orange').text(`• Medium Risk (Contact, Location): ${riskCounts.Medium}`);
        doc.fillColor('green').text(`• Low Risk (Identity, Employee): ${riskCounts.Low}`);
        doc.fillColor('black'); // Reset
        doc.moveDown();

        // DPDP Category Breakdown
        doc.fontSize(14).font('Helvetica-Bold').text("Personal Data Categories", { underline: true });
        doc.moveDown(0.5);
        Object.entries(categoryCounts).forEach(([cat, count]) => {
            doc.fontSize(11).font('Helvetica').text(`• ${cat}: ${count}`);
        });
        doc.moveDown();

        // ----- DETAILED FINDINGS -----
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text("Detailed Findings", { underline: true });
        doc.moveDown();

        items.forEach((item: any, i: any) => {
            const color = item.risk === 'High' ? 'red' : (item.risk === 'Medium' ? 'orange' : 'black');

            doc.fontSize(10).font('Helvetica-Bold').fillColor(color)
                .text(`${i + 1}. [${item.risk?.toUpperCase() || 'LOW'}] ${item.category || 'OTHER'}`, { continued: true });

            doc.font('Helvetica').fillColor('black')
                .text(` - ${item.piiType}`);

            doc.fontSize(9).text(`   Table: ${item.table} | Field: ${item.field} | Confidence: ${(item.confidence * 100).toFixed(0)}%`);
            doc.moveDown(0.5);
        });

        // Disclaimer
        doc.moveDown(2);
        doc.fontSize(8).fillColor('grey').text("This report is generated automatically by DataLens. Please verify findings manually for critical compliance decisions.", { align: 'center' });

        doc.end();
    });
}
