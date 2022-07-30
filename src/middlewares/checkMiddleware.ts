import { SpecificContext } from './../constants/types';
import { sneakyAddId } from '../constants/functions'
import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'

const checkMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx, next) => {
  await sneakyAddId(ctx, ctx.message.from)
  
  const text = ctx.message.text
  
  const chat = await ctx.prisma.chat.findUnique({
    where: { id: ctx.chat.id }
  })
  
  if (chat && chat.config === 'PROTECTED' || (!chat && ctx.chat.type !== 'private')) {
    const admins = await ctx.getChatAdministrators()
    
    if (!admins.some(admin => admin.user.id === ctx.message.from.id)) {
      return ctx.reply('Только администраторы могут использовать этот бот', { reply_to_message_id: ctx.message.message_id })
    }
  } else {
    if (!chat && !text.startsWith('/start')) return ctx.reply('Чтобы начать напишите /start', { reply_to_message_id: ctx.message.message_id })
  }
  
  next()
}

export default checkMiddleware
