import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(user: any): Promise<import("mysql2").RowDataPacket>;
    updateMe(dto: UpdateProfileDto, user: any): Promise<import("mysql2").RowDataPacket>;
    changePassword(dto: ChangePasswordDto, user: any): Promise<{
        message: string;
    }>;
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
