import { errorHandling } from '../constants/functions'

import type { TelegramError } from 'telegraf'
import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { Chat } from '@prisma/client'

const startMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, async () => {
    let replyMessages: String[] = []
    let config = ctx.message.text.split(' ')[1]
    
    if (ctx.chat.type === 'private' && config === 'private') {
      replyMessages.push('only public mode in privat chat')
      config = 'public'
    }
    
    let chat: Chat
    switch (config) {
      case 'private':
        const thisChat = await ctx.getChat()
        
        if (thisChat.type !== 'private') {
          const admins = await ctx.getChatAdministrators()
          if (!admins.find(admin => admin.user.id === ctx.message.from.id)) {
            throw 'Only admin can initialize this bot in private mode'
          }
          
          await ctx.telegram.sendMessage(
            ctx.message.from.id,
            `hello you have started this bot in group ${thisChat.title}`
          ).catch((err: TelegramError) => {
            if (err.response.error_code === 403) {
              throw 'bot is blocked by sender'
            } else throw err
          })
        }
        
        chat = await ctx.prisma.chat.upsert({
          where: { id: ctx.chat.id },
          update: { config: 'PRIVATE' },
          create: { id: ctx.chat.id, config: 'PRIVATE' }
        })
        chat?.config === 'PRIVATE'
          ? replyMessages.push(`yes it is private`) 
          : replyMessages.push('some error occured')
        ctx.telegram.deleteMyCommands({
          scope: {
            type: 'chat',
            chat_id: ctx.chat.id
          }
        })
        break
      
      case 'public':
      case '':
      case undefined:
        chat = await ctx.prisma.chat.upsert({
          where: { id: ctx.chat.id },
          update: { config: 'PUBLIC' },
          create: { id: ctx.chat.id, config: 'PUBLIC' }
        })
        chat?.config === 'PUBLIC'
          ? replyMessages.push('now public')
          : replyMessages.push('some error occured')
        break
      
      default:
        replyMessages.push('unknow config')
    }
    
    ctx.reply(replyMessages.join('\n'), { reply_to_message_id: ctx.message?.message_id })
  })
}

export default startMiddleware
