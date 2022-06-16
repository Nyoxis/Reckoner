import 'dotenv/config'
import Fastify from 'fastify'
import fastifyPrismaClient from './prismaPlugin'

import config from './config'
import botPlugin from './botPlugin'
//to env
const fastify = Fastify({
  logger: true
})

const start = async () => {
  fastify.register(fastifyPrismaClient)
  fastify.register(botPlugin)

  try {
    await fastify.listen(config.PORT)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
