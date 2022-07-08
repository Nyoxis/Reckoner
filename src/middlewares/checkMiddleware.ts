import { SpecificContext } from './../constants/types';
import { sneakyAddId } from '../constants/functions'
import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'

const checkMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx, next) => {
  await sneakyAddId(ctx, ctx.message.from)
  
  const text = ctx.message.text
  const words = text.split(' ')
  if (!(text.startsWith('/')) && !(words.length > 1 && words[1].startsWith('/'))) return
  if (ctx.message.text.startsWith('/start')) return next()
  
  const chat = await ctx.prisma.chat.findUnique({
    where: { id: ctx.chat.id }
  })
  
  if (!chat) {
    return ctx.reply('use /start to initialize this bot')
  } else if (chat?.config === 'PRIVATE') {
    const admins = await ctx.getChatAdministrators()
    
    if (!admins.find(admin => admin.user.id === ctx.message.from.id)) {
      return ctx.reply('only administrator can use this bot')
    }
  }
  
  next()
}

export default checkMiddleware
