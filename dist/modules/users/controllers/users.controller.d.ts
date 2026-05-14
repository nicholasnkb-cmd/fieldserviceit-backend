import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(user: any): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        avatarUrl: string;
        userType: string;
        isActive: boolean;
        lastLoginAt: Date;
    }>;
    updateMe(dto: UpdateProfileDto, user: any): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
    }>;
    changePassword(dto: ChangePasswordDto, user: any): Promise<{
        message: string;
    }>;
    create(dto: any, user: any): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    findAll(query: any, user: any): Promise<{
        data: {
            role: string;
            createdAt: Date;
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            isActive: boolean;
            lastLoginAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: any): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        avatarUrl: string;
        isActive: boolean;
        lastLoginAt: Date;
    }>;
    update(id: string, dto: any, user: any): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    remove(id: string, user: any): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string | null;
        updatedAt: Date;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        userType: string;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        deletedAt: Date | null;
    }>;
}
