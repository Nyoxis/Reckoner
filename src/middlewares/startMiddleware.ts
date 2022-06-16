import { TelegramError } from 'telegraf'
import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'
import type { Chat } from '@prisma/client'

const startMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  try {
    let replyMessage = ''
    let config = ctx.message.text.slice(7)

    if (ctx.chat.type === 'private') {
      if (config === 'private') replyMessage += 'only public mode in privat chat \n'
      if (config === '' || config === 'private') config = 'public'
    } else {
      const admins = await ctx.getChatAdministrators()
      if (!admins.find(admin => admin.user.id === ctx.message.from.id)) {
        throw new TelegramError({
          description: 'Only admin can initialize this bot',
          error_code: 401
        })
      }
    }
    
    let chat: Chat
    switch (config) {
      case 'private':
        const thisChat = await ctx.getChat()
        
        if (thisChat.type !== 'private') {
          await ctx.telegram.sendMessage(
            ctx.message.from.id,
            `hello you have started this bot in group ${thisChat.title}`
          ).catch((err: TelegramError) => {
            throw err
          })
        }
        
        chat = await ctx.prisma.chat.upsert({
          where: { id: ctx.chat.id },
          update: { config: 'PRIVATE' },
          create: { id: ctx.chat.id, config: 'PRIVATE' }
        })
        chat?.config === 'PRIVATE'
          ? replyMessage += `yes it is private`
          : replyMessage += 'some error occured'
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
          ? replyMessage += 'now public'
          : replyMessage += 'some error occured'
        break
        
      default:
        replyMessage += 'unknow config'
    }
    
    ctx.reply(replyMessage, { reply_to_message_id: ctx.message?.message_id })
    
  } catch (err) {
    const tErr = err as TelegramError
    
    switch (tErr.response.error_code) {
      case 401:
        ctx.reply(
          tErr.response.description,
          { reply_to_message_id: ctx.message?.message_id }
        )
        break
      case 403:
        ctx.reply(
          'bot is blocked by sender',
          { reply_to_message_id: ctx.message?.message_id }
        )
        break
      default: throw tErr
    }
  }
}

export default startMiddleware
