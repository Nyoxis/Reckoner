import fp from 'fastify-plugin'
import { Telegraf, Markup } from 'telegraf'

import config from './config'
import checkMiddleware from './middlewares/checkMiddleware'
import { sneakyAddId, findChat } from './constants/functions'
import startMiddleware from './middlewares/startMiddleware'

import {
  default as billMIddleware,
  billActions,
} from './middlewares/billMiddleware'
import {
  default as countMiddleware,
  countActions,
} from './middlewares/countMiddleware'

import {
  default as manageMiddleware,
  memberActions,
} from './middlewares/manageMiddlewares'

import {
  default as historyMiddleware,
  historyActions,
} from './middlewares/historyMiddlewares'

import {
  renameMiddleware,
  includeMiddleware,
  excludeMiddleware,
  freezeMiddleware,
  unfreezeMiddleware,
} from './middlewares/includeMiddlewares'

import { rectifyCommand } from './middlewares/rectifyMiddleware'
import { 
  buyMiddleware,
  orderMiddleware,
  payMiddleware,
  giveMiddleware
} from './middlewares/operationsMiddlewares'
import {
  undoMiddleware,
  redoMiddleware,
  omitMiddleware,
  restoreMiddleware,
} from './middlewares/undoMiddlewares'
import updateMiddleware from './middlewares/updateMiddleware'

import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { ComputeKind } from './constants/accountKind'
import type { Update } from 'telegraf/typings/core/types/typegram'
import type NodeCache from 'node-cache'
import { hasCommands } from './constants'

declare module 'telegraf' {
  interface Context {
    prisma: PrismaClient & ComputeKind
    cache: NodeCache
  }
}

const botPlugin: FastifyPluginAsync = async (fastify) => {
  const bot = new Telegraf(config.BOT_TOKEN)
  bot.use(async (ctx, next) => {
    ctx.prisma = fastify.prisma
    ctx.cache = fastify.cache
    next()
  })
  
  bot.on('text', checkMiddleware)
  bot.on('callback_query', async (ctx, next) => {
    sneakyAddId(ctx, ctx.callbackQuery.from)
    if (!ctx.chat) return
    const chatId = await findChat(ctx)
    const chat = await ctx.prisma.chat.findUnique({
      where: {
        id: chatId
      }
    })
    if (!ctx.callbackQuery.data) return
    const type = ctx.callbackQuery.data.split(';')[0]
    if (chat?.config === 'PROTECTED' && ctx.chat.type !== 'private' && !(type === 'ct' || type === 'pd')) {
      const admins = await ctx.getChatAdministrators()
      
      if (!admins.find(admin => admin.user.id === ctx.callbackQuery.from.id)) {
        return
      }
    }
    next()
  })
  bot.on('inline_query', (ctx, next) => {
    sneakyAddId(ctx, ctx.inlineQuery.from)
    next()
  })
  
  bot.start(startMiddleware)

  bot.command('bill', billMIddleware)
  bot.on('callback_query', billActions)
  bot.on('inline_query', rectifyCommand)
  
  bot.command('count', countMiddleware)
  bot.on('callback_query', countActions)
  
  bot.command('manage', manageMiddleware)
  bot.on('callback_query', memberActions)
  
  bot.command('history', historyMiddleware)
  bot.on('callback_query', historyActions)
  
  bot.command('rename', renameMiddleware)
  bot.command('include', includeMiddleware)
  bot.command('exclude', excludeMiddleware)
  bot.command('freeze', freezeMiddleware)
  bot.command('unfreeze', unfreezeMiddleware)
  
  bot.command('pay', payMiddleware)
  bot.command('order', orderMiddleware)
  bot.command('buy', buyMiddleware)
  bot.command('give', giveMiddleware)
  
  bot.command('undo', undoMiddleware)
  bot.command('redo', redoMiddleware)
  bot.command('omit', omitMiddleware)
  bot.command('restore', restoreMiddleware)
  
  bot.on('text', (ctx, next) => {
    let text = ctx.message.text
    if (text.startsWith('/ ')) text = text.slice(2)
    const words = text.split(' ')
    if (!(words.length > 1 && hasCommands.test(words[1]))) return next()
    
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
    await fastify.prisma.chat.deleteMany({ where: { id: ctx.chat.id } })
    ctx.cache.del(ctx.chat.id)
  })
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
