import { Markup } from 'telegraf'
import { listMembers, updateKeyboard } from '../constants/functions'
import { listManageKeyboard, billTypeUpdate } from '../constants/billUpdateFunctions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'

const manageMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listManageKeyboard(ctx)
  const replyMessage = await ctx.reply(text, {reply_to_message_id: ctx.message.message_id, reply_markup: markup.reply_markup})
  await billTypeUpdate(ctx, 'mg', undefined, replyMessage.message_id)
}

const memberActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if (!ctx.callbackQuery.data) return
  if (!ctx.chat) return
  if (!ctx.callbackQuery.message) return
  
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
    case 'dp':
      const dpParticipant = ctx.callbackQuery.data.split(';')[1]
      const dpParticipantMember = members.find(member => member.account === dpParticipant)
      const dpParticipantLink = dpParticipantMember ? dpParticipantMember.linkName() : ''
      
      if (!dpParticipantMember) throw new Error('cannot find member to manage')
      const buttons = [
        [Markup.button.callback('назад', 'mg')],
        [Markup.button.callback('обнулить', `sz;${dpParticipantMember.account}`)],
        [Markup.button.callback('удалить', `xc;${dpParticipantMember.account}`)],
      ]
      
      text = `Выберите действие для участника ${dpParticipantLink}\n\n` +
             `*ВНИМАНИЕ\\! эти действия не могут быть отменены\\!*`
      markup = Markup.inlineKeyboard(buttons)
      break
      
    case 'mg':
    case 'fz':
    case 'sz':
    case 'xc':
      await billTypeUpdate(ctx, 'mg', ctx.callbackQuery.message.message_id)
      ;({ text, markup } = await listManageKeyboard(ctx))
      break
    default: return next()
  }
  updateKeyboard(ctx, text, markup)
}

export { memberActions }
export default manageMiddleware
