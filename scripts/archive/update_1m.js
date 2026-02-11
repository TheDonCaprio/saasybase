const { PrismaClient } = require('../node_modules/.prisma/client');
(async()=>{
  const p = new PrismaClient();
  try{
    await p.plan.update({where:{name:'1 Month Pro'},data:{stripePriceId:'price_1S5ODiFMsqy36GdGt8WOyKJf',autoRenew:true,recurringInterval:'month'}});
    console.log('updated 1M plan');
  }catch(e){console.error(e);process.exit(1);}finally{await p.$disconnect();}
})();
