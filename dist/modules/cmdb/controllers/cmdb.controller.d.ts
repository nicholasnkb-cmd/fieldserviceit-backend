import { CmdbService } from '../services/cmdb.service';
export declare class CmdbController {
    private cmdbService;
    constructor(cmdbService: CmdbService);
    create(dto: any, user: any): Promise<import("mysql2").RowDataPacket>;
    findAll(query: any, user: any): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
    update(id: string, dto: any, user: any): Promise<import("mysql2").RowDataPacket>;
    remove(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
}
