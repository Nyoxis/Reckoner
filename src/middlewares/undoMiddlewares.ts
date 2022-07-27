import { withType, commandName, errorHandling, listTransactions, editErrorHandling } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import { PrismaChatContext, RecordWithType } from '../constants/types'
import { billMessageUpdate } from '../constants/billUpdateFunctions'

const activateInactivateFunction = async (ctx: PrismaChatContext, id: number | bigint, activate: boolean) => {
  if (!ctx.chat) throw new Error('Context has no chat object')
  const updated = await ctx.prisma.record.update({
    select: {
      id: true,
      messageId: true,
      replyId: true,
      chatId: true,
      donorAccount: true,
      hasDonor: true,
      recipientsQuantity: true,
      amount: true,
      active: true,
      recipients: {
        select: {
          account: true,
        }
      }
    },
    where: {
      chatId_id: {
        id: id,
        chatId: ctx.chat.id,
      }
    },
    data: {
      active: activate
    }
  })
  if (!updated) return 'Статус не изменен'
  
  const updatedRecord = await withType(ctx, updated)
  const replyText = (activate ? 'Операция восстановлена' : 'Операция пропущена') + '\n' + commandName(updatedRecord)
  editErrorHandling(async () => {
    if (ctx.chat && updatedRecord.replyId) {
      await ctx.telegram.editMessageText(ctx.chat.id, Number(updatedRecord.replyId), undefined, replyText)
    }
  })
  
  return replyText
}

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
    
    if (!latestRecord) throw 'Больше нет активных операций'
    
    const replyText = await activateInactivateFunction(ctx, latestRecord.id, false)
    await billMessageUpdate(ctx)
    ctx.reply(replyText, { reply_to_message_id: ctx.message.message_id })
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
    
    if (!latestRecord) throw 'Больше нет пропущенных операций'
    
    const replyText = await activateInactivateFunction(ctx, latestRecord.id, true)
    await billMessageUpdate(ctx)
    ctx.reply(replyText, { reply_to_message_id: ctx.message.message_id })
  })
}

const omitRestoreOperation = async (ctx: PrismaChatContext, activate: boolean) => {
  const transactions = await ctx.prisma.record.findMany({
    select: {
      id: true
    },
    where: {
      chatId: ctx.chat?.id,
      active: !activate,
    }
  })
  const donePromise = transactions.map(transaction => {
    return activateInactivateFunction(ctx, transaction.id, activate)
  })
  const done = await Promise.all(donePromise)
  const success = done.filter(result => result !== 'Статус не изменен')
  await billMessageUpdate(ctx)
  return success.length
}

const omitMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const omitted = await omitRestoreOperation(ctx, false)
  ctx.reply(`${omitted} операций пропущено`,{ reply_to_message_id: ctx.message.message_id })
}

const restoreMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const restored = await omitRestoreOperation(ctx, true)
  ctx.reply(`${restored} операций восстановлено`,{ reply_to_message_id: ctx.message.message_id })
}

export { activateInactivateFunction, undoMiddleware, redoMiddleware, omitRestoreOperation, omitMiddleware, restoreMiddleware }
