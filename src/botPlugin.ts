import fp from 'fastify-plugin'
import { Telegraf, Markup } from 'telegraf'

import config from './config'
import checkMiddleware from './middlewares/checkMiddleware'
import startMiddleware from './middlewares/startMiddleware'
import {
  default as manageMiddleware,
  memberActions,
} from './middlewares/manageMiddlewares'
import {
  includeMiddleware,
  excludeMiddleware,
  freezeMiddleware,
  unfreezeMiddleware,
} from './middlewares/includeMiddlewares'
import {
  default as billMIddleware,
  composeCommand,
  rectifyCommand,
} from './middlewares/billMiddleware'
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
import updateMiddleware from './middlewares/updateMiddleware'

import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { ComputeKind } from './constants/accountKind'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { sneakyAddId } from './constants/functions'

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
  bot.on('callback_query', (ctx, next) => {
    sneakyAddId(ctx, ctx.callbackQuery.from)
    next()
  })
  bot.on('inline_query', (ctx, next) => {
    sneakyAddId(ctx, ctx.inlineQuery.from)
    next()
  })
  
  bot.start(startMiddleware)
  bot.command('manage', manageMiddleware)
  bot.on('callback_query', memberActions)
  
  bot.command('include', includeMiddleware)
  bot.command('exclude', excludeMiddleware)
  bot.command('freeze', freezeMiddleware)
  bot.command('unfreeze', unfreezeMiddleware)
  
  bot.command('bill', billMIddleware)
  bot.on('callback_query', composeCommand)
  bot.on('inline_query', rectifyCommand)
  
  bot.command('pay', payMiddleware)
  bot.command('order', orderMiddleware)
  bot.command('buy', buyMiddleware)
  bot.command('give', giveMiddleware)
  
  bot.command('undo', undoMiddleware)
  bot.command('redo', redoMiddleware)
  
  bot.on('text', (ctx, next) => {
    const text = ctx.message.text
    const words = text.split(' ')
    if (!(words.length > 1 && words[1].startsWith('/'))) return next()

    const command = words[1]
    switch(command) {
      case '/pay':
        payMiddleware(ctx, next)
        break
      case '/order':
        orderMiddleware(ctx, next)
        break
      case '/buy':
        buyMiddleware(ctx, next)
        break
      case '/give':
        giveMiddleware(ctx, next)
        break
      default: return next()
    }
    next()
  })
  bot.command('stop', async (ctx) => {
    const deleted = await fastify.prisma.chat.deleteMany({ where: { id: ctx.chat.id } })
    ctx.reply(JSON.stringify(deleted), { reply_to_message_id: ctx.message.message_id })
  })
  /*
  const SECRET_PATH = `/telegraf/${bot.secretPathComponent()}`
  fastify.post(SECRET_PATH, (request: FastifyRequest<{ Body: Update }>, reply) => bot.handleUpdate(request.body, reply.raw))
  bot.telegram.setWebhook(config.WEBHOOK_URL + SECRET_PATH)
    .then(() => {
      console.log('Webhook is set on', config.WEBHOOK_URL)
    })*/
  bot.on('edited_message', updateMiddleware)
  bot.launch()
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

export default fp(botPlugin)
