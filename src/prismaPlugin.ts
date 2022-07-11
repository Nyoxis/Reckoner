import fp from 'fastify-plugin'
import { PrismaClient, Member } from '@prisma/client'

import withComputeKind from './constants/accountKind'

import type { ComputeKind } from './constants/accountKind'
import type { PrismaClientOptions } from '@prisma/client/runtime'
import type { FastifyPluginCallback } from 'fastify'

export type FastifyPrismaClientOptions = Omit<
  PrismaClientOptions,
  "__internal"
>

const prismaClient: FastifyPluginCallback<FastifyPrismaClientOptions> = async (
  fastify,
  options,
  next
) => {
  if (fastify.prisma) {
    return next(new Error("fastify-prisma-client has been defined before"))
  }
  
  const prisma = withComputeKind(new PrismaClient(options))
  
  await prisma.$connect()
  
  fastify
    .decorate('prisma', prisma)
    .addHook('onClose', async (fastify, done) => {
      await fastify.prisma.$disconnect()
      done()
    })
  
  next()
}

export default fp(prismaClient)

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient & ComputeKind
  }
}