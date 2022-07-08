import { Markup } from 'telegraf'
import { listMembers } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext } from '../constants/types'

const listKeyboard = async (ctx: PrismaChatContext) => {
  const members = await listMembers(ctx, undefined)
  let buttons = [
    [Markup.button.callback('назад', 'bl')],
  ]
  buttons = buttons.concat(members.map((member) => {
    const data = ['ac', member.account].join(';')
    return [Markup.button.callback(member.displayName(), data)]
  }))
  const markup = Markup.inlineKeyboard(buttons)
  const text = 'Полный список участников'
  
  return { text, markup }
}

const manageMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listKeyboard(ctx)
  ctx.reply(text, {reply_to_message_id: ctx.message.message_id, reply_markup: markup.reply_markup})
}

const memberActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if(!ctx.callbackQuery.message) return next()
  const message = ctx.callbackQuery.message
  if (!ctx.callbackQuery.data) return
  
  const members = await listMembers(ctx, undefined)
  
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>

  const type = ctx.callbackQuery.data.split(';')[0]
  switch(type) {
    case 'mg':
      ({ text, markup } = await listKeyboard(ctx))
      break
      
    case 'ac':
      const acParticipant = ctx.callbackQuery.data.split(';')[1]
      const acParticipantMember = members.find(member => member.account === acParticipant)
      const acParticipantLink = acParticipantMember ? acParticipantMember.linkName() : ''
      
      const buttons = [
        [Markup.button.callback('назад', 'mg')],
        [Markup.button.callback('заморозить', 'mg')],
        [Markup.button.callback('обнулить', 'mg')],
        [Markup.button.callback('удалить', 'mg')],
      ]
      
      text = `Выберите действие для участника ${acParticipantLink}`
      markup = Markup.inlineKeyboard(buttons)
      break
      
    default: return next()
  }
  
  if ('text' in ctx.callbackQuery.message && ctx.callbackQuery.message.text === text) return next()
  ctx.telegram.editMessageText(
    message.chat.id,
    message.message_id,
    undefined,
    text,
    { parse_mode: 'MarkdownV2', reply_markup: markup.reply_markup }
  )
}

export { memberActions }
export default manageMiddleware
