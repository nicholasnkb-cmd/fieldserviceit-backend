import { SearchService } from './search.service';
export declare class SearchController {
    private searchService;
    constructor(searchService: SearchService);
    search(q: string, user: any): Promise<{
        tickets: {
            createdAt: Date;
            id: string;
            priority: string;
            ticketNumber: string;
            title: string;
            category: string;
            status: string;
        }[];
        assets: {
            name: string;
            id: string;
            location: string;
            status: string;
            assetType: string;
            serialNumber: string;
        }[];
    }> | {
        tickets: any[];
        assets: any[];
    };
}
