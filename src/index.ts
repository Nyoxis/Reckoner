import 'dotenv/config'
import Fastify from 'fastify'
import fastifyPrismaClient from './prismaPlugin'
import NodeCache from 'node-cache'

import config from './config'
import botPlugin from './botPlugin'

const fastify = Fastify({
  logger: !config.PRODUCTION
})

const start = async () => {
  fastify.register(fastifyPrismaClient)
  fastify.register(botPlugin)
  
  const cache = new NodeCache({ stdTTL: 600 })
  
  fastify
    .decorate('cache', cache)
    .addHook('onClose', (fastify, done) => {
      fastify.cache.close()
      done()
    })
  
  try {
    await fastify.listen(config.PORT)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()

declare module 'fastify' {
  interface FastifyInstance {
    cache: NodeCache
  }
}