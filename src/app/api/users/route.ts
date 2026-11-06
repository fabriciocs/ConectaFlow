import bcrypt from "bcryptjs";
import { z } from "zod";
import { personalTenantId } from "@/lib/tenancy/context";
import { withPrivilegedAdministration } from "@/lib/tenancy/privileged";

const createUserSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(6).max(128),
    role: z.enum(["SUPERADMIN", "STAFF", "USER"]).default("USER"),
});

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

export function GET(request: Request) {
    return withPrivilegedAdministration(request, {
        name: "USER_DIRECTORY_READ", action: "READ", resourceType: "User",
    }, async (tx) => {
        const users = await tx.user.findMany({
            orderBy: { createdAt: "desc" },
            select: { ...userSelect, _count: { select: { sessions: true } } },
        });
        return { data: { status: true, message: "Users fetched successfully", data: users } };
    });
}

export function POST(request: Request) {
    return withPrivilegedAdministration(request, {
        name: "USER_CREATE", action: "WRITE", resourceType: "User",
    }, async (tx) => {
        const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return { status: 400, data: { status: false, message: "Validation error" } };
        }

        const { name, password, role } = parsed.data;
        const email = parsed.data.email.toLowerCase();
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
            return { status: 409, data: { status: false, message: "Email already exists" } };
        }

        const user = await tx.user.create({
            data: { name, email, password: await bcrypt.hash(password, 10), role },
            select: userSelect,
        });
        const tenantId = personalTenantId(user.id);
        await tx.tenant.create({
            data: {
                id: tenantId,
                slug: tenantId,
                name: `${name.slice(0, 100)} — Personal`,
                memberships: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } },
            },
        });
        return {
            status: 201, resourceId: user.id, tenantId,
            data: { status: true, message: "User created successfully", data: user },
        };
    });
}
