import bcrypt from "bcryptjs";
import { z } from "zod";
import { withPrivilegedAdministration } from "@/lib/tenancy/privileged";

const userPatch = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(254).optional(),
    password: z.string().min(6).max(128).optional(),
    role: z.enum(["SUPERADMIN", "STAFF", "USER"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

type UserParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: UserParams) {
    const { id } = await params;
    return withPrivilegedAdministration(request, {
        name: "USER_UPDATE", action: "WRITE", resourceType: "User", resourceId: id,
    }, async (tx) => {
        const parsed = userPatch.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return { status: 400, data: { status: false, message: "Validation error" } };
        }

        const target = await tx.user.findUnique({ where: { id }, select: { id: true, email: true } });
        if (target?.id !== id) return { status: 404, data: { status: false, message: "User not found" } };

        const { name, email, password, role } = parsed.data;
        const normalizedEmail = email?.toLowerCase();
        const emailChanged = normalizedEmail !== undefined && normalizedEmail !== target.email;
        const user = await tx.user.update({
            where: { id },
            data: {
                name, email: normalizedEmail, role,
                password: password ? await bcrypt.hash(password, 10) : undefined,
                ...(emailChanged ? { emailVerified: false, emailVerifiedAt: null } : {}),
            },
            select: { id: true, name: true, email: true, role: true, updatedAt: true },
        });
        return { data: { status: true, message: "User updated successfully", data: user } };
    });
}

export async function DELETE(request: Request, { params }: UserParams) {
    const { id } = await params;
    return withPrivilegedAdministration(request, {
        name: "USER_DELETE", action: "DELETE", resourceType: "User", resourceId: id,
    }, async (tx, actorUserId) => {
        const target = await tx.user.findUnique({ where: { id }, select: { id: true } });
        if (target?.id !== id) return { status: 404, data: { status: false, message: "User not found" } };
        if (target.id === actorUserId) {
            return { status: 400, data: { status: false, message: "Cannot delete yourself" } };
        }

        await tx.user.delete({ where: { id } });
        return { data: { status: true, message: "User deleted successfully" } };
    });
}
