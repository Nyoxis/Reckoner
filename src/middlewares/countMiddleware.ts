import { checkPinned, listCount } from '../constants/billUpdateFunctions'
import { findChat } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import { PrismaChatContext } from '../constants/types'

const countMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const text = await listCount(ctx)
  const replyMessage = await ctx.reply(text, {
    reply_to_message_id: ctx.message.message_id,
    parse_mode: 'MarkdownV2'
  })
  await countIdUpdate(ctx, replyMessage.message_id)
}

const countMessageUpdate = async (ctx: PrismaChatContext) => {

}

const countIdUpdate = async (ctx: PrismaChatContext, countMessageId: number) => {
  if (!ctx.chat) return
  if (countMessageId) {
    const pinned = await checkPinned(ctx, 'countMessageId')
    if (pinned) return
    await countMessageUpdate(ctx)
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


export default countMiddleware