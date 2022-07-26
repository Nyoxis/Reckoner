import { Markup } from 'telegraf'
import { updateKeyboard } from '../constants/functions'
import { billTypeUpdate, listHistoryKeyboard } from '../constants/billUpdateFunctions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'

import { activateInactivateFunction, omitRestoreOperation } from './undoMiddlewares'

const historyMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listHistoryKeyboard(ctx)
  const replyMessage = await ctx.reply(text, {reply_to_message_id: ctx.message.message_id, reply_markup: markup.reply_markup})
  await billTypeUpdate(ctx, 'hs', undefined, replyMessage.message_id)
}
  
const historyActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if (!ctx.callbackQuery.data) return
  if (!ctx.callbackQuery.message) return
  if (!ctx.chat) return
  
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>
  
  const type = ctx.callbackQuery.data.split(';')[0]
  const param2 = ctx.callbackQuery.data.split(';')[1]
  const param3 = ctx.callbackQuery.data.split(';')[2]
  switch(type) {
    case 'om':
      await omitRestoreOperation(ctx, false)
      break
      
    case 'rs':
      await omitRestoreOperation(ctx, true)
      break
      
    case 'ia':
    case 'ac':
      const id = param3 ? Number(param3) : undefined
      if (!id) return
      await activateInactivateFunction(ctx, id, type === 'ac' ? true : false)
      break

  }
  switch (type) {
    case 'hs':
    case 'om':
    case 'rs':
    case 'ia':
    case 'ac':
      const from = param2 ? Number(param2) : undefined
      await billTypeUpdate(ctx, 'hs', ctx.callbackQuery.message.message_id)
      ;({ text, markup } = await listHistoryKeyboard(ctx, from))
      break
    default: return next()
  }

  updateKeyboard(ctx, text, markup)
}

export { historyActions }
export default historyMiddleware
