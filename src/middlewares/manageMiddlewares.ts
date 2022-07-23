import { Markup } from 'telegraf'
import { listMembers, updateKeyboard } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext } from '../constants/types'

const listKeyboard = async (ctx: PrismaChatContext) => {
  const members = await listMembers(ctx, undefined)
  const activeMembers = members.filter(member => member.active)
  
  let buttons: InlineKeyboardButton[][] = []
  if (activeMembers.length !== 0) buttons = [[Markup.button.callback('назад', 'bl')]]
  
  buttons = buttons.concat(members.map((member) => {
    return [
      Markup.button.callback(`${member.active ? '' : '❆'}${member.displayName()}`, `ac;${member.account}`),
      Markup.button.callback(member.active ? 'заморозить' : 'разморозить',`fz;${member.account}`),
    ]
  }))
  
  let text
  if (members.length !== 0) text = 'Полный список участников'
  else {
    text = 'Список участников пуст'
    buttons = []
  }
  buttons.push([Markup.button.switchToCurrentChat('добавить участника', '/include ')])
  
  const markup = Markup.inlineKeyboard(buttons)
  return { text, markup }
}

const manageMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listKeyboard(ctx)
  ctx.reply(text, {reply_to_message_id: ctx.message.message_id, reply_markup: markup.reply_markup})
}

const memberActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if (!ctx.callbackQuery.data) return
  if (!ctx.chat) return
  
  const members = await listMembers(ctx, undefined)
  
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>

  const type = ctx.callbackQuery.data.split(';')[0]
  switch(type) {
    case 'fz':
      const fzParticipant = ctx.callbackQuery.data.split(';')[1]
      const fzParticipantMember = members.find(member => member.account === fzParticipant)
      
      if (!fzParticipantMember) throw new Error('cannot find member to freeze')
      await ctx.prisma.member.update({
        where: {
          chatId_account: {
            chatId: fzParticipantMember.chatId,
            account: fzParticipantMember.account,
          }
        },
        data: { active: !fzParticipantMember.active }
      })
      ctx.cache.del(ctx.chat.id)
      break
      
    case 'sz':
      const szParticipant = ctx.callbackQuery.data.split(';')[1]
      const szParticipantMember = members.find(member => member.account === szParticipant)
      
      if (!szParticipantMember) throw new Error('cannot find member to set zero')
      const deleted = await ctx.prisma.member.delete({
        where: {
          chatId_account: {
            chatId: szParticipantMember.chatId,
            account: szParticipantMember.account,
          }
        }
      })
      await ctx.prisma.member.create({
        data: deleted
      })
      break
    
    case 'xc':
      const xcParticipant = ctx.callbackQuery.data.split(';')[1]
      const xcParticipantMember = members.find(member => member.account === xcParticipant)

      if (!xcParticipantMember) throw new Error('cannot find member to set zero')
      await ctx.prisma.member.delete({
        where: {
          chatId_account: {
            chatId: xcParticipantMember.chatId,
            account: xcParticipantMember.account,
          }
        }
      })
      ctx.cache.del(ctx.chat.id)
      break
      
  }
  switch(type) {
    case 'ac':
      const acParticipant = ctx.callbackQuery.data.split(';')[1]
      const acParticipantMember = members.find(member => member.account === acParticipant)
      const acParticipantLink = acParticipantMember ? acParticipantMember.linkName() : ''
      
      if (!acParticipantMember) throw new Error('cannot find member to manage')
      const buttons = [
        [Markup.button.callback('назад', 'mg')],
        [Markup.button.callback('обнулить', `sz;${acParticipantMember.account}`)],
        [Markup.button.callback('удалить', `xc;${acParticipantMember.account}`)],
        [Markup.button.switchToCurrentChat('заменить или переименовать участника', `/include ${acParticipantLink}*`)],
      ]
      
      text = `Выберите действие для участника ${acParticipantLink}\n\n` +
             `*ВНИМАНИЕ\\! эти действия не могут быть отменены\\!*`
      markup = Markup.inlineKeyboard(buttons)
      break
      
    case 'mg':
    case 'fz':
    case 'sz':
    case 'xc':
      ({ text, markup } = await listKeyboard(ctx))
      break
    default: return next()
  }
  updateKeyboard(ctx, text, markup)
}

export { memberActions }
export default manageMiddleware
