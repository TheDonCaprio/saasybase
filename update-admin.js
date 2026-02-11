// Update user role to admin
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateAdminRole() {
  try {
    // First check if user exists
    const user = await prisma.user.findUnique({
      where: { email: 'caprio@capriofiles.com' }
    });

    if (!user) {
      console.log('User with email caprio@capriofiles.com not found.');
      console.log('Available users:');
      const allUsers = await prisma.user.findMany({
        select: { id: true, email: true, role: true }
      });
      console.table(allUsers);
      return;
    }

    // Update role to ADMIN
    const updatedUser = await prisma.user.update({
      where: { email: 'caprio@capriofiles.com' },
      data: { role: 'ADMIN' }
    });

    console.log('Successfully updated user role:');
    console.log({
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role
    });

  } catch (error) {
    console.error('Error updating admin role:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminRole();
