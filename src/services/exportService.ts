import { ActivityService } from './activityService';
import PDFDocument from 'pdfkit';
import neo4j from 'neo4j-driver';
export class ExportService {
    private activityService = new ActivityService();

    async exportActivitiesToCSV(): Promise<string> {
        const activities = await this.activityService.listActivities();

        const headers = [
            'Activity ID',
            'Name',
            'Process',
            'Owner',
            'Status',
            'Purpose',
            'Categories',
            'Risk',
            'Sensitivity',
            'DPIA Status',
            'Created At'
        ];

        let csv = headers.join(',') + '\n';

        const normalize = (val: any): string => {
            if (val === null || val === undefined) return '';

            if (neo4j.isInt(val)) {
                return val.toNumber().toString();
            }

            if (val.year && val.month && val.day) {
                const yyyy = val.year.toNumber();
                const mm = String(val.month.toNumber()).padStart(2, '0');
                const dd = String(val.day.toNumber()).padStart(2, '0');
                const hh = String(val.hour.toNumber()).padStart(2, '0');
                const mi = String(val.minute.toNumber()).padStart(2, '0');
                const ss = String(val.second.toNumber()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
            }

            return String(val);
        };

        const safe = (val: any) =>
            `"${normalize(val).replace(/"/g, '""')}"`;

        activities.forEach(a => {
            const row = [
                a.activityId ?? '',
                safe(a.name),
                safe(a.businessProcess),
                a.ownerUserId ?? '',
                a.status ?? '',
                safe(a.purpose),
                safe((a.personalDataTypes || []).join(';')),
                normalize(a.riskScore),
                a.sensitivity ?? '',
                a.dpiaStatus ?? '',
                normalize(a.createdAt)
            ];

            csv += row.join(',') + '\n';
        });

        return csv;
    }

    async exportActivitiesToPDF(): Promise<Buffer> {
        const activities = await this.activityService.listActivities();
        return new Promise((resolve) => {
            const doc = new PDFDocument();
            const chunks: any[] = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            doc.fontSize(20).text('Processing Activities Registry', { underline: true });
            doc.moveDown();
            doc.fontSize(10).text(`Generated on: ${new Date().toISOString()}`);
            doc.moveDown(2);

            activities.forEach((a, i) => {
                doc.fontSize(14).text(`${i + 1}. ${a.name} (${a.status})`);
                doc.fontSize(11)
                    .text(`   Process: ${a.businessProcess}`)
                    .text(`   Owner: ${a.ownerUserId}`)
                    .text(`   Risk: ${a.riskScore} | Sensitivity: ${a.sensitivity}`)
                    .text(`   DPIA: ${a.dpiaStatus}`)
                    .text(`   Categories: ${(a.personalDataTypes || []).join(', ')}`);
                doc.moveDown();
            });

            doc.end();
        });
    }
}
