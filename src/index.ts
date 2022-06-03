import Fastify from 'fastify'
//to env
const fastify = Fastify({
  logger: true
})

fastify.get('/', (request, reply) => {
  reply.send('hello world')
})

fastify.listen(process.env.PORT, )