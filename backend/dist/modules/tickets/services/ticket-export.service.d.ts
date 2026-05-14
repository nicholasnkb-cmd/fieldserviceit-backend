import { PrismaService } from '../../../database/prisma.service';
export declare class TicketExportService {
    private prisma;
    constructor(prisma: PrismaService);
    exportCsv(companyId: string, status?: string): Promise<string>;
}
