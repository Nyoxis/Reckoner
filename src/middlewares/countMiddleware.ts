import { Markup } from 'telegraf'
import { checkPinned, listCount, personalDebtText } from '../constants/billUpdateFunctions'
import { findChat, updateKeyboard, listMembers } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext } from '../constants/types'

const countMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listCount(ctx)
  const chatId = await findChat(ctx)

  let extra: Types.ExtraReplyMessage = {
    reply_markup: markup.reply_markup,
    parse_mode: 'MarkdownV2',
  }
  if (chatId === ctx.chat.id) extra = {...extra, reply_to_message_id: ctx.message.message_id }
  const replyMessage = await ctx.telegram.sendMessage(
    Number(chatId),
    text,
    extra,
  )
  await countIdUpdate(ctx, replyMessage.message_id)
}

const countActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if(!ctx.callbackQuery.message) return next()
  const message = ctx.callbackQuery.message
  if (!ctx.callbackQuery.data) return
  
  const members = await listMembers(ctx)
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>
  
  const type = ctx.callbackQuery.data.split(';')[0]
  switch (type) {
    case 'ct':
      ({ text, markup } = await listCount(ctx))
      break
      
    case 'pd':
      const donor = ctx.callbackQuery.data.split(';')[1]
      const donorMember = members.find(member => member.account === donor)
      if (!donorMember) throw new Error('donor for personal debt is not a member')
      text = await personalDebtText(ctx, donorMember)
      const buttons = [
        [Markup.button.callback('назад', 'ct')],
      ]
      markup = Markup.inlineKeyboard(buttons)
      break

    default: return next()
  }
  
  updateKeyboard(ctx, text, markup)
}

const countIdUpdate = async (ctx: PrismaChatContext, countMessageId: number) => {
  if (!ctx.chat) return
  if (countMessageId) {
    const pinned = await checkPinned(ctx, 'countMessageId')
    if (pinned) return
  }
  
  const chatId = await findChat(ctx)
  await ctx.prisma.chat.updateMany({
    where: {
      id: chatId
    },
    data: {
      countMessageId,
    }
  })
}

export { countActions }
export default countMiddleware
