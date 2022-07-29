import { PrismaClient } from '@prisma/client'

const migration = async () => {
  const prisma = new PrismaClient()

  await prisma.$connect()
  
  
  console.log('successfully migrated')
  await prisma.$disconnect()
}

export default migration
