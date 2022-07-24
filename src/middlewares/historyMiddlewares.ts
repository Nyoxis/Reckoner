import { Markup } from 'telegraf'
import { listTransactions, updateKeyboard } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext } from '../constants/types'

const listHistoryKeyboard = async (ctx: PrismaChatContext) => {
  let buttons: InlineKeyboardButton[][] = []
  buttons = [[Markup.button.callback('назад', 'bl')]]
  
  const transactions = await listTransactions(ctx)
  
  buttons = buttons.concat(transactions.map(transaction => {
    return [Markup.button.callback(`${transaction.id} ${transaction.getType()} ${transaction.amount}`, 'bl')]
  }))
  
  let text = 'список всех операций'
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
  switch(type) {
    case 'hs':
      ({ text, markup } = await listHistoryKeyboard(ctx))
      break
    default: return next()
  }
  updateKeyboard(ctx, text, markup)
}

export { historyActions }
export default historyMiddleware
