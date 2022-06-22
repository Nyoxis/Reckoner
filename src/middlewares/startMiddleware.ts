import { TelegramError } from 'telegraf'
import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'
import type { Chat } from '@prisma/client'

const startMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  try {
    let replyMessages: String[] = []
    let config = ctx.message.text.slice(7)
    
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
    
  } catch (err) {
    if (typeof err === 'string') {
      ctx.reply(err, { reply_to_message_id: ctx.message.message_id })
    } else throw err
  }
}

export default startMiddleware
