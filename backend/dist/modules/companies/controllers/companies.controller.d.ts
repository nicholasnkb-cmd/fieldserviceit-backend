import { CompaniesService } from '../services/companies.service';
export declare class CompaniesController {
    private companiesService;
    constructor(companiesService: CompaniesService);
    create(dto: any): Promise<import("mysql2").RowDataPacket>;
    findAll(query: any, user: any): Promise<import("mysql2").RowDataPacket> | Promise<{
        data: any;
        meta: {
            page: number;
            limit: number;
            total: any;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
    getStats(id: string, user: any): Promise<{
        tickets: any;
        users: any;
        assets: any;
        dispatches: any;
    }>;
    update(id: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    remove(id: string): Promise<import("mysql2").RowDataPacket>;
}
