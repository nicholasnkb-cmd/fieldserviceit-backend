import { SearchService } from './search.service';
export declare class SearchController {
    private searchService;
    constructor(searchService: SearchService);
    search(q: string, user: any): Promise<{
        tickets: any[];
        assets: import("mysql2").RowDataPacket[];
    }> | {
        tickets: any[];
        assets: any[];
    };
}
