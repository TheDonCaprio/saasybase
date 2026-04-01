import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixDuplicateCustomerIds() {
    const customerId = 'cust_SBR4Z3a22GBwFU';
    const userToClean = 'cmmqjs0sq0006qd4ldtnl63gj';
    
    const user = await prisma.user.findUnique({ where: { id: userToClean }, select: { externalCustomerIds: true, externalCustomerId: true } });
    
    if (user) {
        let currentMap: Record<string, string> = {};
        if (typeof user.externalCustomerIds === 'string') {
            currentMap = JSON.parse(user.externalCustomerIds);
        } else if (user.externalCustomerIds && typeof user.externalCustomerIds === 'object') {
            currentMap = user.externalCustomerIds as Record<string, string>;
        }
        
        const newMap = { ...currentMap };
        if (newMap.razorpay === customerId) {
            delete newMap.razorpay;
        }
        
        const removeLegacy = user.externalCustomerId === customerId;
        
        await prisma.user.update({
            where: { id: userToClean },
            data: {
                externalCustomerIds: Object.keys(newMap).length > 0 ? JSON.stringify(newMap) : null,
                ...(removeLegacy ? { externalCustomerId: null } : {})
            }
        });
        console.log(`Cleaned up corrupted customer ID for user ${userToClean}`);
    }
}

fixDuplicateCustomerIds().catch(console.error).finally(() => prisma.$disconnect());
