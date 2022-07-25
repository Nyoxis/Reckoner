import { errorHandling } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'

const undoMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, async () => {
    const latestRecord = await ctx.prisma.record.findFirst({
      select: {
        id: true,
        chatId: true,
      },
      orderBy: {
        id: 'desc'
      },
      where: {
        chatId: ctx.chat.id,
        active: true,
      }
    })
    
    if (!latestRecord) throw 'no more records'
    
    const updatedRecord = await ctx.prisma.record.update({
      where: {
        chatId_id: {
          id: latestRecord?.id,
          chatId: latestRecord?.chatId
        }
      },
      data: {
        active: false
      }
    })
    ctx.reply(updatedRecord.amount.toString(), { reply_to_message_id: ctx.message.message_id })
  })
}

const redoMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, async () => {
    const latestRecord = await ctx.prisma.record.findFirst({
      select: {
        id: true,
        chatId: true,
      },
      orderBy: {
        id: 'asc'
      },
      where: {
        chatId: ctx.chat.id,
        active: false,
      }
    })
    
    if (!latestRecord) throw 'latest record reached'
    
    const updatedRecord = await ctx.prisma.record.update({
      where: {
        chatId_id: {
          id: latestRecord?.id,
          chatId: latestRecord?.chatId
        }
      },
      data: {
        active: true
      }
    })
    ctx.reply(updatedRecord.amount.toString(), { reply_to_message_id: ctx.message.message_id })
  })
}

export { undoMiddleware, redoMiddleware }
