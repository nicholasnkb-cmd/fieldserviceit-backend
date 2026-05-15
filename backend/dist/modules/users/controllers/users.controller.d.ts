import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        role: string;
        userType: string;
        companyId: string | null;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    updateMe(dto: UpdateProfileDto, user: any): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        role: string;
        companyId: string;
        createdAt: Date;
    }>;
    changePassword(dto: ChangePasswordDto, user: any): Promise<{
        message: string;
    }>;
    create(dto: any, user: any): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        companyId: string;
        createdAt: Date;
    }>;
    findAll(query: any, user: any): Promise<{
        data: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            isActive: boolean;
            lastLoginAt: Date;
            createdAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: any): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        phone: string;
        avatarUrl: string;
        isActive: boolean;
        lastLoginAt: Date;
        createdAt: Date;
    }>;
    update(id: string, dto: any, user: any): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    }>;
    remove(id: string, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        role: string;
        userType: string;
        companyId: string | null;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
}
