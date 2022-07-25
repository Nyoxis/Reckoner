import { Markup } from 'telegraf'
import { listMembers, listTransactions, updateKeyboard } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext, RecordWithType } from '../constants/types'

const recalculateAmount = (transaction: RecordWithType) => {
  if (transaction.recipientsQuantity) {
    return transaction.amount / transaction.recipientsQuantity * transaction.recipients.length
  }
  return transaction.amount
}

const composeCommand = async (ctx: PrismaChatContext, transaction: RecordWithType) => {
  const members = await listMembers(ctx)
  const fullRecipients = transaction.recipients.map(recipient => members.find(member => member.account === recipient.account))
  const recipientsLinks = fullRecipients.map(recipient => recipient ? recipient.linkName() : '')
  const fullDonor = members.find(member => member.account === transaction.donorAccount)
  const donorLink = fullDonor ? fullDonor.linkName() : ''
  
  return [
    donorLink,
    fullDonor ? transaction.getType() : transaction.getType() !== 'pay' ? '/order' : '/pay',
    ...recipientsLinks,
    recalculateAmount(transaction)
  ].join(' ')
}

const listHistoryKeyboard = async (ctx: PrismaChatContext, from?: number | bigint) => {
  if (!ctx.chat) throw new Error('callBack is not from chat')
  const last = await ctx.prisma.record.findFirst({
    where: {
      chatId: ctx.chat.id
    },
    orderBy: {
      id: 'desc'
    }
  })
  if (!last) throw 'Список пуст'
  if (!from) from = last.id - 9n
  
  let buttons: InlineKeyboardButton[][] = []
  buttons = [[Markup.button.callback('назад', 'bl')]]
  
  const transactions = await listTransactions(ctx, from)
  
  const commandButtonsPromises = transactions.map(async (transaction) => {
    const buttonText = `#${transaction.id} /${transaction.getType()} ${transaction.amount} ` +
                       `${transaction.getType() !== 'pay' ? '/ ' + transaction.recipientsQuantity : ''}`
    
    return [
      Markup.button.switchToCurrentChat(buttonText, await composeCommand(ctx, transaction)),
      Markup.button.callback(transaction.active ? 'пропустить' : 'восстановить', `ia;${from};${transaction.id}`),
    ]
  })
  const commandButtons = await Promise.all(commandButtonsPromises)
  buttons = buttons.concat(commandButtons)
  
  buttons.push([
    Markup.button.callback('предыдущие', `hs;${Number(from) - 10}`, Number(from) <= 1),
    Markup.button.callback('следующие', `hs;${Number(from) + 10}`, (Number(from) + 10) > Number(last.id)),
  ])
  
  let text = 'Список всех операций'
  const markup = Markup.inlineKeyboard(buttons)
  return { text, markup}
}

const historyMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listHistoryKeyboard(ctx)
  ctx.reply(text, {reply_to_message_id: ctx.message.message_id, reply_markup: markup.reply_markup})
}
  
const historyActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if (!ctx.callbackQuery.data) return
  if (!ctx.chat) return
  
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>
  
  const type = ctx.callbackQuery.data.split(';')[0]
  const param2 = ctx.callbackQuery.data.split(';')[1]
  const param3 = ctx.callbackQuery.data.split(';')[2]
  switch(type) {
    case 'ia':
      const id = param3 ? Number(param3) : undefined
      if (!id) return
      const record = await ctx.prisma.record.findUnique({
        select: {
          id: true,
          chatId: true,
          active: true,
        },
        where: {
          chatId_id: {
            chatId: ctx.chat.id,
            id,
          }
        }
      })
      if (record) {
        await ctx.prisma.record.update({
          where: {
            chatId_id: {
              chatId: record.chatId,
              id: record.id,
            }
          },
          data: {
            active: !record.active
          }
        })
      }
    
    case 'hs':
      const from = param2 ? Number(param2) : undefined
      ;({ text, markup } = await listHistoryKeyboard(ctx, from))
      break
    default: return next()
  }
  updateKeyboard(ctx, text, markup)
}

export { historyActions }
export default historyMiddleware
