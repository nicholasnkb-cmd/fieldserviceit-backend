import { SearchService } from './search.service';
export declare class SearchController {
    private searchService;
    constructor(searchService: SearchService);
    search(q: string, user: any): Promise<{
        tickets: {
            id: string;
            ticketNumber: string;
            title: string;
            status: string;
            priority: string;
            category: string;
            createdAt: Date;
        }[];
        assets: {
            id: string;
            name: string;
            assetType: string;
            serialNumber: string;
            status: string;
            location: string;
        }[];
    }> | {
        tickets: any[];
        assets: any[];
    };
}
