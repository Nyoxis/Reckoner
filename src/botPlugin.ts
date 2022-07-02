import fp from 'fastify-plugin'
import { Telegraf } from 'telegraf'

import config from './config'
import checkMiddleware from './middlewares/checkMiddleware'
import startMiddleware from './middlewares/startMiddleware'
import includeMiddleware from './middlewares/includeMiddleware'
import billMIddleware from './middlewares/billMiddleware'
import updateMiddleware from './middlewares/updateMiddleware'
import { 
  buyMiddleware,
  orderMiddleware,
  payMiddleware,
  giveMiddleware
} from './middlewares/operationsMiddlewares'
import {
  undoMiddleware,
  redoMiddleware,
} from './middlewares/historyMiddlewares'

import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Update } from 'telegraf/typings/core/types/typegram'
import type { PrismaClient } from '@prisma/client'
import type { ComputeKind } from './constants/accountKind'

declare module 'telegraf' {
  interface Context {
    prisma: PrismaClient & ComputeKind
  }
}

const botPlugin: FastifyPluginAsync = async (fastify) => {
  const bot = new Telegraf(config.BOT_TOKEN)
  bot.use(async (ctx, next) => {
    ctx.prisma = fastify.prisma
    next()
  })
  
  bot.on('text', checkMiddleware)
  
  bot.start(startMiddleware)
  bot.command('include', includeMiddleware)
  bot.command('bill', billMIddleware)

  bot.command('pay', payMiddleware)
  bot.command('order', orderMiddleware)
  bot.command('buy', buyMiddleware)
  bot.command('give', giveMiddleware)
  
  bot.command('undo', undoMiddleware)
  bot.command('redo', redoMiddleware)
  
  bot.help(async (ctx) => {
    const chat = await fastify.prisma.chat.findUnique({ where: { id: ctx.chat.id } })
    const members = await fastify.prisma.member.findMany({ where: { chatId: ctx.chat.id }})
    ctx.reply(JSON.stringify(members))
    ctx.reply(chat ? chat.config : 'not started', { reply_to_message_id: ctx.message.message_id })
    //ctx.telegram.sendMessage(ctx.message.from.id, 'hello')
  })
  
  bot.command('stop', async (ctx) => {
    const deleted = await fastify.prisma.chat.deleteMany({ where: { id: ctx.chat.id } })
    ctx.reply(JSON.stringify(deleted), { reply_to_message_id: ctx.message.message_id })
  })
  bot.on('text', (ctx) => ctx.message.text === '/💦' ? ctx.reply(ctx.message.text, { reply_to_message_id: ctx.message.message_id }) : undefined)
  
  const SECRET_PATH = `/telegraf/${bot.secretPathComponent()}`
  fastify.post(SECRET_PATH, (request: FastifyRequest<{ Body: Update }>, reply) => bot.handleUpdate(request.body, reply.raw))
  bot.telegram.setWebhook(config.WEBHOOK_URL + SECRET_PATH)
    .then(() => {
      console.log('Webhook is set on', config.WEBHOOK_URL)
    })
  bot.on('edited_message', updateMiddleware)
  bot.launch()
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

export default fp(botPlugin)
