const { PrismaClient } = require('../node_modules/.prisma/client');
(async ()=>{
  const prisma = new PrismaClient();
  try{
    const id = process.env.DEV_ADMIN_ID || 'user_323THm91hd4lilt0VxjggohKfFb';
    const email = 'caprio@capriofiles.com';
    const user = await prisma.user.upsert({
      where: { id },
      update: { role: 'ADMIN', email },
      create: { id, email, name: 'Caprio', role: 'ADMIN' }
    });
    console.log('Upserted admin user:', user.id, user.email, user.role);
  }catch(e){
    console.error('Error upserting admin:', e);
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
